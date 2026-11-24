import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/services/auth.service";
import { getDateRange } from "@/lib/timezone";
import { logActivity } from "@/services/activity.service";
import { handleApiError } from "@/lib/api-utils";
import { HolidayType } from "@prisma/client";

const createHolidaySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().min(1).max(120),
  type: z.nativeEnum(HolidayType).default(HolidayType.HOLIDAY),
  allowMeals: z.boolean().default(false),
  note: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const url = new URL(req.url);
    const year = url.searchParams.get("year");

    const holidays = await prisma.holiday.findMany({
      where: year ? { date: { startsWith: `${year}-` } } : {},
      orderBy: { date: "asc" },
    });

    return NextResponse.json({ holidays });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const data = createHolidaySchema.parse(body);

    const endDate = data.endDate ?? data.startDate;
    if (endDate < data.startDate) {
      return NextResponse.json({ error: "End date must be on or after start date." }, { status: 400 });
    }

    const dates = getDateRange(data.startDate, endDate);
    if (dates.length > 62) {
      return NextResponse.json({ error: "Date range cannot exceed 62 days." }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const dateStr of dates) {
        const holiday = await tx.holiday.upsert({
          where: { date: dateStr },
          update: {
            name: data.name.trim(),
            type: data.type,
            allowMeals: data.allowMeals,
            note: data.note ?? null,
          },
          create: {
            date: dateStr,
            name: data.name.trim(),
            type: data.type,
            allowMeals: data.allowMeals,
            note: data.note ?? null,
          },
        });

        // If meals are disallowed on a holiday, reset non-customized future/existing records to 0
        if (!data.allowMeals) {
          await tx.mealRecord.updateMany({
            where: { date: dateStr, isCustomized: false, isFinalized: false },
            data: { quantity: 0 },
          });
        }

        results.push(holiday);
      }

      await logActivity({
        tx,
        actorId: admin.id,
        action: "UPSERT_HOLIDAY",
        entityType: "Holiday",
        entityId: results[0]?.id ?? data.startDate,
        date: data.startDate,
        newValue: JSON.stringify({
          startDate: data.startDate,
          endDate,
          name: data.name,
          type: data.type,
          allowMeals: data.allowMeals,
        }),
      });

      return results;
    });

    return NextResponse.json({ holidays: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
