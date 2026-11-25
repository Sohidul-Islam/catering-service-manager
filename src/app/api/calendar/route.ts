import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/services/auth.service";
import {
  ensureMonthSchedule,
  getSettings,
  isWorkingDay,
  resolveMealPrice,
} from "@/services/schedule.service";
import {
  getMonthDateRange,
  getNowInTimezone,
  isPastMealDeadline,
} from "@/lib/timezone";
import { handleApiError } from "@/lib/api-utils";
import { AdjustmentStatus, UserRole } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const [user, settings] = await Promise.all([requireAuth(), getSettings()]);
    const now = getNowInTimezone(settings.timezone);

    const url = new URL(req.url);
    const year = Number(url.searchParams.get("year") ?? now.year);
    const month = Number(url.searchParams.get("month") ?? now.month);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
    }

    // Ensure monthly schedule exists automatically & idempotently
    await ensureMonthSchedule(year, month, null, false, settings);

    const dates = getMonthDateRange(year, month);
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const isAdmin = user.role === UserRole.ADMIN;

    const [holidays, prices, records, pendingRequests, sentConfirmationLogs, allGuests] =
      await Promise.all([
        prisma.holiday.findMany({
          where: { date: { gte: startDate, lte: endDate } },
        }),
        prisma.mealPrice.findMany({
          where: { date: { gte: startDate, lte: endDate } },
        }),
        prisma.mealRecord.findMany({
          where: {
            date: { gte: startDate, lte: endDate },
            ...(isAdmin ? {} : { userId: user.id }),
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                mealPreference: true,
                mealStartDate: true,
              },
            },
          },
          orderBy: [{ date: "asc" }, { user: { name: "asc" } }],
        }),
        prisma.mealAdjustmentRequest.findMany({
          where: {
            date: { gte: startDate, lte: endDate },
            status: AdjustmentStatus.PENDING,
            ...(isAdmin ? {} : { userId: user.id }),
          },
        }),
        isAdmin
          ? prisma.emailLog.findMany({
              where: {
                emailType: "MEAL_CONFIRMATION",
                status: "SENT",
                mealDate: { gte: startDate, lte: endDate },
              },
              orderBy: { sentAt: "desc" },
              select: { guestId: true, mealDate: true, sentAt: true },
            })
          : Promise.resolve([]),
        isAdmin
          ? prisma.user.findMany({
              where: { role: UserRole.GUEST },
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                mealPreference: true,
                defaultMealQty: true,
                mealStartDate: true,
              },
              orderBy: { name: "asc" },
            })
          : Promise.resolve([]),
      ]);

    const confirmationSentMap = new Map<string, string>();
    for (const log of sentConfirmationLogs) {
      if (log.guestId && log.mealDate && log.sentAt) {
        const key = `${log.guestId}::${log.mealDate}`;
        if (!confirmationSentMap.has(key)) {
          confirmationSentMap.set(key, log.sentAt.toISOString());
        }
      }
    }

    const holidayMap = new Map(holidays.map((h) => [h.date, h]));
    const priceMap = new Map(prices.map((p) => [p.date, p]));
    const priceValueMap = new Map(prices.map((p) => [p.date, p.pricePoisha]));

    const recordsByDate = new Map<string, typeof records>();
    for (const r of records) {
      const list = recordsByDate.get(r.date) ?? [];
      list.push(r);
      recordsByDate.set(r.date, list);
    }

    const pendingByDate = new Map<string, typeof pendingRequests>();
    for (const p of pendingRequests) {
      const list = pendingByDate.get(p.date) ?? [];
      list.push(p);
      pendingByDate.set(p.date, list);
    }

    const days = dates.map((dateStr) => {
      const holiday = holidayMap.get(dateStr) ?? null;
      const customPrice = priceMap.get(dateStr) ?? null;
      const working = isWorkingDay(dateStr, settings, holidayMap);
      const effectivePricePoisha = resolveMealPrice(dateStr, settings, priceValueMap);
      const locked = isPastMealDeadline(
        dateStr,
        settings.deadlineHour,
        settings.deadlineMinute,
        settings.timezone
      );

      const dayRecords = recordsByDate.get(dateStr) ?? [];
      const dayPending = pendingByDate.get(dateStr) ?? [];

      const totalMeals = dayRecords.reduce((sum, r) => sum + r.quantity, 0);
      const activeGuestsCount = dayRecords.filter((r) => r.quantity > 0).length;
      const totalAmountPoisha = dayRecords.reduce(
        (sum, r) => sum + r.quantity * r.unitPricePoisha,
        0
      );

      return {
        date: dateStr,
        isToday: dateStr === now.dateStr,
        isWorkingDay: working,
        isLocked: locked,
        holiday,
        hasCustomPrice: Boolean(customPrice),
        effectivePricePoisha,
        totalMeals,
        activeGuestsCount,
        totalAmountPoisha,
        pendingAdjustmentsCount: dayPending.length,
        records: dayRecords.map((r) => ({
          id: r.id,
          userId: r.userId,
          guestName: r.user.name,
          guestEmail: r.user.email,
          guestStatus: r.user.status,
          guestMealStartDate: r.user.mealStartDate ?? null,
          quantity: r.quantity,
          unitPricePoisha: r.unitPricePoisha,
          totalPoisha: r.quantity * r.unitPricePoisha,
          source: r.source,
          overrideScope: r.overrideScope,
          isCustomized: r.isCustomized,
          isFinalized: r.isFinalized,
          confirmationEmailSentAt: isAdmin
            ? confirmationSentMap.get(`${r.userId}::${r.date}`) ?? null
            : null,
        })),
        myPendingRequest: isAdmin ? null : dayPending[0] ?? null,
      };
    });

    return NextResponse.json({
      year,
      month,
      today: now.dateStr,
      guestMealStartDate: isAdmin ? null : user.mealStartDate ?? null,
      ...(isAdmin ? { guests: allGuests } : {}),
      settings: {
        timezone: settings.timezone,
        defaultMealPricePoisha: settings.defaultMealPricePoisha,
        deadlineHour: settings.deadlineHour,
        deadlineMinute: settings.deadlineMinute,
        maxMealQty: settings.maxMealQty,
      },
      days,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
