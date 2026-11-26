import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/services/auth.service";
import { submitAdjustmentRequest } from "@/services/meal.service";
import { sendAdjustmentRequestAdminEmails } from "@/services/notification.service";
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
    const countOnly = url.searchParams.get("countOnly") === "true";

    if (countOnly) {
      const pendingCount = await prisma.mealAdjustmentRequest.count({
        where: {
          status: AdjustmentStatus.PENDING,
          ...(user.role === UserRole.GUEST ? { userId: user.id } : {}),
        },
      });
      return NextResponse.json({ pendingCount });
    }

    const [requests, pendingCount] = await Promise.all([
      prisma.mealAdjustmentRequest.findMany({
        where: {
          ...(user.role === UserRole.GUEST ? { userId: user.id } : {}),
          ...(statusParam ? { status: statusParam } : {}),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.mealAdjustmentRequest.count({
        where: {
          status: AdjustmentStatus.PENDING,
          ...(user.role === UserRole.GUEST ? { userId: user.id } : {}),
        },
      }),
    ]);

    return NextResponse.json({ requests, pendingCount });
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

    const origin =
      req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

    const emailResults = await sendAdjustmentRequestAdminEmails({
      guestId: user.id,
      guestName: user.name,
      guestEmail: user.email,
      date: request.date,
      currentQuantity: request.currentQuantity,
      requestedQuantity: request.requestedQuantity,
      reason: request.reason,
      origin,
    });

    const adminNotified = emailResults.some((r) => r.success);

    return NextResponse.json({ request, adminNotified }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
