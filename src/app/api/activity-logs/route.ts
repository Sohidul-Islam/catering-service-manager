import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/services/auth.service";
import { handleApiError } from "@/lib/api-utils";
import { UserRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 100));
    const action = url.searchParams.get("action") || undefined;

    const logs = await prisma.activityLog.findMany({
      where: {
        ...(user.role === UserRole.GUEST
          ? {
              OR: [{ targetUserId: user.id }, { actorId: user.id }],
            }
          : {}),
        ...(action ? { action } : {}),
      },
      include: {
        actor: { select: { id: true, name: true, role: true } },
        targetUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    return handleApiError(error);
  }
}
