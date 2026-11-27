import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/services/auth.service";
import { logActivity } from "@/services/activity.service";
import { syncScheduleForDates } from "@/services/schedule.service";
import { handleApiError } from "@/lib/api-utils";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;

    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.holiday.delete({ where: { id } });
      await syncScheduleForDates([existing.date], tx);
      await logActivity({
        tx,
        actorId: admin.id,
        action: "DELETE_HOLIDAY",
        entityType: "Holiday",
        entityId: id,
        date: existing.date,
        previousValue: existing.name,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
