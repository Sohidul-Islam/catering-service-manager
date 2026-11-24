import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/services/auth.service";
import { updateMealQuantity } from "@/services/meal.service";
import { handleApiError } from "@/lib/api-utils";
import { UserRole } from "@prisma/client";

const updateMealSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  quantity: z.number().int().min(0),
  scope: z.enum(["SINGLE_DATE", "FOLLOWING_DATES"]).default("SINGLE_DATE"),
  userId: z.string().optional(),
  reason: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const data = updateMealSchema.parse(body);

    const targetUserId =
      user.role === UserRole.ADMIN && data.userId ? data.userId : user.id;

    const result = await updateMealQuantity({
      actorId: user.id,
      actorRole: user.role,
      targetUserId,
      date: data.date,
      quantity: data.quantity,
      scope: data.scope,
      reason: data.reason,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
