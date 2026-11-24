import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/services/auth.service";
import { getSettings } from "@/services/schedule.service";
import { logActivity } from "@/services/activity.service";
import { handleApiError } from "@/lib/api-utils";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;

    const existing = await prisma.mealPrice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Price override not found" }, { status: 404 });
    }

    const settings = await getSettings();

    await prisma.$transaction(async (tx) => {
      await tx.mealPrice.delete({ where: { id } });
      await tx.mealRecord.updateMany({
        where: { date: existing.date, isFinalized: false },
        data: { unitPricePoisha: settings.defaultMealPricePoisha },
      });

      await logActivity({
        tx,
        actorId: admin.id,
        action: "DELETE_DATE_MEAL_PRICE",
        entityType: "MealPrice",
        entityId: id,
        date: existing.date,
        previousValue: String(existing.pricePoisha),
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
