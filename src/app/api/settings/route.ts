import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/services/auth.service";
import { getSettings, syncScheduleForDates } from "@/services/schedule.service";
import { bdtToPoisha } from "@/lib/money";
import { logActivity } from "@/services/activity.service";
import { handleApiError } from "@/lib/api-utils";

const settingsSchema = z.object({
  organizationName: z.string().min(1).max(120),
  timezone: z.string().min(1).max(60),
  defaultMealPriceBdt: z.number().min(0),
  deadlineHour: z.number().int().min(0).max(23),
  deadlineMinute: z.number().int().min(0).max(59),
  maxMealQty: z.number().int().min(1).nullable().optional(),
  weekendDays: z.string(),
});

export async function GET() {
  try {
    await requireAuth();
    const settings = await getSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const data = settingsSchema.parse(body);

    const existing = await getSettings();
    const updated = await prisma.organizationSettings.update({
      where: { id: "default" },
      data: {
        organizationName: data.organizationName.trim(),
        timezone: data.timezone.trim(),
        defaultMealPricePoisha: bdtToPoisha(data.defaultMealPriceBdt),
        deadlineHour: data.deadlineHour,
        deadlineMinute: data.deadlineMinute,
        maxMealQty: data.maxMealQty ?? null,
        weekendDays: data.weekendDays,
      },
    });

    if (existing.weekendDays !== updated.weekendDays) {
      const unfinalizedDates = await prisma.mealRecord.findMany({
        where: { isFinalized: false },
        distinct: ["date"],
        select: { date: true },
      });
      await syncScheduleForDates(unfinalizedDates.map((d) => d.date));
    }

    await logActivity({
      actorId: admin.id,
      action: "UPDATE_SETTINGS",
      entityType: "OrganizationSettings",
      entityId: "default",
      previousValue: JSON.stringify({
        defaultMealPricePoisha: existing.defaultMealPricePoisha,
        deadlineHour: existing.deadlineHour,
        deadlineMinute: existing.deadlineMinute,
      }),
      newValue: JSON.stringify({
        defaultMealPricePoisha: updated.defaultMealPricePoisha,
        deadlineHour: updated.deadlineHour,
        deadlineMinute: updated.deadlineMinute,
      }),
    });

    return NextResponse.json({ settings: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
