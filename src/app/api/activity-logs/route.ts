import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/services/auth.service";
import { handleApiError } from "@/lib/api-utils";
import { Prisma, UserRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || undefined;
    const search = url.searchParams.get("search")?.trim() || "";
    const pageParam = url.searchParams.get("page");
    const pageSizeParam = url.searchParams.get("pageSize");

    const andConditions: Prisma.ActivityLogWhereInput[] = [];
    if (user.role === UserRole.GUEST) {
      andConditions.push({
        OR: [{ targetUserId: user.id }, { actorId: user.id }],
      });
    }
    if (action) {
      andConditions.push({ action });
    }
    if (search) {
      andConditions.push({
        OR: [
          { action: { contains: search } },
          { date: { contains: search } },
          { previousValue: { contains: search } },
          { newValue: { contains: search } },
          { reason: { contains: search } },
          { actor: { is: { name: { contains: search } } } },
          { targetUser: { is: { name: { contains: search } } } },
        ],
      });
    }

    const where: Prisma.ActivityLogWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    if (pageParam !== null) {
      const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam ?? "20", 10) || 20));
      const requestedPage = Math.max(1, parseInt(pageParam, 10) || 1);
      const total = await prisma.activityLog.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);

      const logs = await prisma.activityLog.findMany({
        where,
        include: {
          actor: { select: { id: true, name: true, role: true } },
          targetUser: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return NextResponse.json({
        logs,
        pagination: { page, pageSize, total, totalPages },
      });
    }

    const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 100));
    const logs = await prisma.activityLog.findMany({
      where,
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
