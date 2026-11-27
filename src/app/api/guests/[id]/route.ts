import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/services/auth.service";
import { logActivity } from "@/services/activity.service";
import { resyncGuestDefaultMeals, getSettings } from "@/services/schedule.service";
import { getGuestDashboardData } from "@/services/guest-dashboard.service";
import { getNowInTimezone } from "@/lib/timezone";
import { handleApiError } from "@/lib/api-utils";
import { MealPreference, UserRole, UserStatus } from "@prisma/client";

const updateGuestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().nullable().optional(),
  status: z.nativeEnum(UserStatus).optional(),
  mealPreference: z.nativeEnum(MealPreference).optional(),
  defaultMealQty: z.number().int().min(0).optional(),
  mealStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid meal start date (YYYY-MM-DD)")
    .nullable()
    .optional(),
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const guest = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        mealPreference: true,
        defaultMealQty: true,
        mealStartDate: true,
        joinedAt: true,
        createdAt: true,
        invitation: {
          select: {
            token: true,
            expiresAt: true,
            acceptedAt: true,
            createdAt: true,
          },
        },
        mealRecords: { orderBy: { date: "desc" }, take: 60 },
        mealRuleHistories: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { changedBy: { select: { name: true, role: true } } },
        },
        invoices: { orderBy: [{ year: "desc" }, { month: "desc" }] },
        payments: {
          orderBy: { paidAt: "desc" },
          take: 20,
          include: { invoice: { select: { invoiceNumber: true } } },
        },
      },
    });
    if (!guest || guest.role !== UserRole.GUEST) {
      return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    }

    const [dashboard, activityLogs] = await Promise.all([
      getGuestDashboardData(id),
      prisma.activityLog.findMany({
        where: {
          OR: [{ targetUserId: id }, { actorId: id }],
        },
        include: {
          actor: { select: { name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return NextResponse.json({ guest, dashboard, activityLogs });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json();
    const data = updateGuestSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.mealPreference !== undefined ? { mealPreference: data.mealPreference } : {}),
          ...(data.defaultMealQty !== undefined ? { defaultMealQty: data.defaultMealQty } : {}),
          ...(data.mealStartDate !== undefined ? { mealStartDate: data.mealStartDate } : {}),
        },
      });

      await logActivity({
        tx,
        actorId: admin.id,
        targetUserId: id,
        action: "UPDATE_GUEST_PROFILE",
        entityType: "User",
        entityId: id,
        previousValue: JSON.stringify({
          status: existing.status,
          mealPreference: existing.mealPreference,
          defaultMealQty: existing.defaultMealQty,
          mealStartDate: existing.mealStartDate,
        }),
        newValue: JSON.stringify({
          status: user.status,
          mealPreference: user.mealPreference,
          defaultMealQty: user.defaultMealQty,
          mealStartDate: user.mealStartDate,
        }),
      });

      return user;
    });

    if (
      updated.status === UserStatus.ACTIVE &&
      (existing.status !== UserStatus.ACTIVE ||
        existing.mealStartDate !== updated.mealStartDate ||
        existing.mealPreference !== updated.mealPreference ||
        existing.defaultMealQty !== updated.defaultMealQty)
    ) {
      const settings = await getSettings();
      const now = getNowInTimezone(settings.timezone);
      await resyncGuestDefaultMeals(updated.id, now.year, now.month);
    }

    return NextResponse.json({ guest: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
