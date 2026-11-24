import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/services/auth.service";
import { getSettings } from "@/services/schedule.service";
import { getDateRange } from "@/lib/timezone";
import { bdtToPoisha } from "@/lib/money";
import { logActivity } from "@/services/activity.service";
import { handleApiError } from "@/lib/api-utils";

const priceSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priceBdt: z.number().min(0),
  note: z.string().max(300).optional(),
});

const defaultPriceSchema = z.object({
  defaultMealPriceBdt: z.number().min(0),
});

export async function GET() {
  try {
    await requireAuth();
    const [settings, prices] = await Promise.all([
      getSettings(),
      prisma.mealPrice.findMany({
        orderBy: { date: "desc" },
        include: { createdBy: { select: { name: true } } },
      }),
    ]);

    return NextResponse.json({
      defaultMealPricePoisha: settings.defaultMealPricePoisha,
      prices,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();

    if ("defaultMealPriceBdt" in body) {
      const { defaultMealPriceBdt } = defaultPriceSchema.parse(body);
      const newPoisha = bdtToPoisha(defaultMealPriceBdt);
      const settings = await getSettings();

      const updated = await prisma.organizationSettings.update({
        where: { id: "default" },
        data: { defaultMealPricePoisha: newPoisha },
      });

      await logActivity({
        actorId: admin.id,
        action: "UPDATE_DEFAULT_PRICE",
        entityType: "OrganizationSettings",
        entityId: "default",
        previousValue: String(settings.defaultMealPricePoisha),
        newValue: String(newPoisha),
      });

      return NextResponse.json({ defaultMealPricePoisha: updated.defaultMealPricePoisha });
    }

    const data = priceSchema.parse(body);
    const endDate = data.endDate ?? data.startDate;
    if (endDate < data.startDate) {
      return NextResponse.json({ error: "End date must be on or after start date." }, { status: 400 });
    }

    const dates = getDateRange(data.startDate, endDate);
    if (dates.length > 62) {
      return NextResponse.json({ error: "Date range cannot exceed 62 days." }, { status: 400 });
    }

    const pricePoisha = bdtToPoisha(data.priceBdt);

    const created = await prisma.$transaction(async (tx) => {
      const items = [];
      for (const dateStr of dates) {
        const price = await tx.mealPrice.upsert({
          where: { date: dateStr },
          update: {
            pricePoisha,
            note: data.note ?? null,
            createdById: admin.id,
          },
          create: {
            date: dateStr,
            pricePoisha,
            note: data.note ?? null,
            createdById: admin.id,
          },
        });

        // Update unfinalized meal records for this date so upcoming schedule reflects date-specific price
        // Finalized records retain their historical snapshot!
        await tx.mealRecord.updateMany({
          where: { date: dateStr, isFinalized: false },
          data: { unitPricePoisha: pricePoisha },
        });

        items.push(price);
      }

      await logActivity({
        tx,
        actorId: admin.id,
        action: "SET_DATE_MEAL_PRICE",
        entityType: "MealPrice",
        entityId: items[0]?.id ?? data.startDate,
        date: data.startDate,
        newValue: JSON.stringify({ startDate: data.startDate, endDate, pricePoisha }),
        reason: data.note ?? null,
      });

      return items;
    });

    return NextResponse.json({ prices: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
