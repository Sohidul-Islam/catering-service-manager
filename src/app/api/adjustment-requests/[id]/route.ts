import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/services/auth.service";
import { reviewAdjustmentRequest } from "@/services/meal.service";
import { sendAdjustmentDecisionEmail } from "@/services/notification.service";
import { handleApiError } from "@/lib/api-utils";

const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json();
    const { decision, reviewNote } = reviewSchema.parse(body);

    const updated = await reviewAdjustmentRequest({
      requestId: id,
      reviewerId: admin.id,
      decision,
      reviewNote,
    });

    const guest = await prisma.user.findUnique({
      where: { id: updated.userId },
      select: { id: true, name: true, email: true },
    });

    let emailSent = false;
    let emailError: string | undefined;

    if (guest) {
      const emailRes = await sendAdjustmentDecisionEmail({
        guestId: guest.id,
        guestName: guest.name,
        guestEmail: guest.email,
        date: updated.date,
        currentQuantity: updated.currentQuantity,
        requestedQuantity: updated.requestedQuantity,
        decision,
        reviewNote: updated.reviewNote,
        sentById: admin.id,
      });
      emailSent = emailRes.success;
      if (!emailRes.success) {
        emailError = emailRes.error;
      }
    }

    return NextResponse.json({ request: updated, emailSent, emailError });
  } catch (error) {
    return handleApiError(error);
  }
}
