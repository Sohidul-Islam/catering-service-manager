import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/services/auth.service";
import { submitAdjustmentRequest } from "@/services/meal.service";
import { handleApiError } from "@/lib/api-utils";
import { AdjustmentStatus, UserRole } from "@prisma/client";

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestedQuantity: z.number().int().min(0),
  reason: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status") as AdjustmentStatus | null;

    const requests = await prisma.mealAdjustmentRequest.findMany({
      where: {
        ...(user.role === UserRole.GUEST ? { userId: user.id } : {}),
        ...(statusParam ? { status: statusParam } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ requests });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const data = createSchema.parse(body);

    const request = await submitAdjustmentRequest({
      userId: user.id,
      date: data.date,
      requestedQuantity: data.requestedQuantity,
      reason: data.reason,
    });

    return NextResponse.json({ request }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
