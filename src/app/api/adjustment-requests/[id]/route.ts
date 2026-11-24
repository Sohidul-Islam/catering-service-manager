import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/services/auth.service";
import { reviewAdjustmentRequest } from "@/services/meal.service";
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

    return NextResponse.json({ request: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
