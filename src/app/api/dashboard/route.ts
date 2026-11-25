import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/services/auth.service";
import { ensureMonthSchedule, getSettings, isWorkingDay } from "@/services/schedule.service";
import {
  getMonthDateRange,
  getNowInTimezone,
  getTomorrowDateStr,
  isPastMealDeadline,
} from "@/lib/timezone";
import { handleApiError } from "@/lib/api-utils";
import { AdjustmentStatus, UserRole, UserStatus } from "@prisma/client";

export async function GET() {
  try {
    const [user, settings] = await Promise.all([requireAuth(), getSettings()]);
    const now = getNowInTimezone(settings.timezone);
    const tomorrow = getTomorrowDateStr(settings.timezone);

    await ensureMonthSchedule(now.year, now.month, null, false, settings);

    const monthDates = getMonthDateRange(now.year, now.month);
    const startDate = monthDates[0];
    const endDate = monthDates[monthDates.length - 1];

    if (user.role === UserRole.ADMIN) {
      const [
        activeGuestsCount,
        monthRecords,
        monthInvoices,
        pendingRequestsCount,
        upcomingHolidays,
        allGuestsWithInvoices,
      ] = await Promise.all([
        prisma.user.count({ where: { role: UserRole.GUEST, status: UserStatus.ACTIVE } }),
        prisma.mealRecord.findMany({
          where: { date: { gte: startDate, lte: endDate } },
        }),
        prisma.invoice.findMany({
          where: { year: now.year, month: now.month },
        }),
        prisma.mealAdjustmentRequest.count({ where: { status: AdjustmentStatus.PENDING } }),
        prisma.holiday.findMany({
          where: { date: { gte: now.dateStr } },
          orderBy: { date: "asc" },
          take: 5,
        }),
        prisma.user.findMany({
          where: { role: UserRole.GUEST },
          select: {
            id: true,
            name: true,
            email: true,
            invoices: {
              select: { totalAmountPoisha: true, paidAmountPoisha: true },
            },
          },
          orderBy: { name: "asc" },
        }),
      ]);

      let todayMeals = 0;
      let tomorrowMeals = 0;
      let monthlyMeals = 0;
      let monthlyAmountPoisha = 0;
      const dailyChartMap = new Map<string, { date: string; meals: number; amountBdt: number }>();

      for (const d of monthDates) {
        dailyChartMap.set(d, { date: d.slice(8), meals: 0, amountBdt: 0 });
      }

      for (const r of monthRecords) {
        if (r.date === now.dateStr) todayMeals += r.quantity;
        if (r.date === tomorrow) tomorrowMeals += r.quantity;
        monthlyMeals += r.quantity;
        const amt = r.quantity * r.unitPricePoisha;
        monthlyAmountPoisha += amt;

        const entry = dailyChartMap.get(r.date);
        if (entry) {
          entry.meals += r.quantity;
          entry.amountBdt += amt / 100;
        }
      }

      const collectedPaymentsPoisha = monthInvoices.reduce(
        (s, i) => s + i.paidAmountPoisha,
        0
      );
      const invoicedTotalPoisha = monthInvoices.reduce((s, i) => s + i.totalAmountPoisha, 0);

      const guestBalances = allGuestsWithInvoices
        .map((g) => {
          const billed = g.invoices.reduce((s, i) => s + i.totalAmountPoisha, 0);
          const paid = g.invoices.reduce((s, i) => s + i.paidAmountPoisha, 0);
          return {
            id: g.id,
            name: g.name,
            email: g.email,
            billedPoisha: billed,
            paidPoisha: paid,
            outstandingPoisha: Math.max(0, billed - paid),
          };
        })
        .filter((g) => g.outstandingPoisha > 0 || g.billedPoisha > 0);

      const totalOutstandingAllTime = guestBalances.reduce(
        (s, g) => s + g.outstandingPoisha,
        0
      );

      return NextResponse.json({
        role: "ADMIN",
        year: now.year,
        month: now.month,
        today: now.dateStr,
        tomorrow,
        stats: {
          activeGuestsCount,
          todayMeals,
          tomorrowMeals,
          monthlyMeals,
          monthlyAmountPoisha,
          invoicedTotalPoisha,
          collectedPaymentsPoisha,
          outstandingDuesPoisha: totalOutstandingAllTime,
          pendingRequestsCount,
        },
        dailyChart: Array.from(dailyChartMap.values()),
        upcomingHolidays,
        guestBalances,
      });
    }

    // GUEST dashboard
    const [
      monthRecords,
      allInvoices,
      recentPayments,
      holidays,
      tomorrowPendingReq,
    ] = await Promise.all([
      prisma.mealRecord.findMany({
        where: { userId: user.id, date: { gte: startDate, lte: endDate } },
        orderBy: { date: "asc" },
      }),
      prisma.invoice.findMany({
        where: { userId: user.id },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
      prisma.payment.findMany({
        where: { userId: user.id },
        orderBy: { paidAt: "desc" },
        take: 5,
        include: { invoice: { select: { invoiceNumber: true } } },
      }),
      prisma.holiday.findMany({
        where: { date: { gte: startDate, lte: endDate } },
      }),
      prisma.mealAdjustmentRequest.findFirst({
        where: { userId: user.id, date: tomorrow, status: AdjustmentStatus.PENDING },
      }),
    ]);

    const holidayMap = new Map(holidays.map((h) => [h.date, h]));
    const todayRec = monthRecords.find((r) => r.date === now.dateStr) ?? null;
    const tomorrowRec = monthRecords.find((r) => r.date === tomorrow) ?? null;
    const tomorrowLocked = isPastMealDeadline(
      tomorrow,
      settings.deadlineHour,
      settings.deadlineMinute,
      settings.timezone
    );
    const tomorrowWorking = isWorkingDay(tomorrow, settings, holidayMap);

    const monthlyMeals = monthRecords.reduce((s, r) => s + r.quantity, 0);
    const monthlyBillPoisha = monthRecords.reduce(
      (s, r) => s + r.quantity * r.unitPricePoisha,
      0
    );

    const totalBilledAll = allInvoices.reduce((s, i) => s + i.totalAmountPoisha, 0);
    const totalPaidAll = allInvoices.reduce((s, i) => s + i.paidAmountPoisha, 0);
    const remainingDuesPoisha = Math.max(0, totalBilledAll - totalPaidAll);

    const upcomingMeals = monthRecords
      .filter((r) => r.date >= now.dateStr)
      .slice(0, 7);

    return NextResponse.json({
      role: "GUEST",
      year: now.year,
      month: now.month,
      today: now.dateStr,
      tomorrow,
      settings: {
        timezone: settings.timezone,
        deadlineHour: settings.deadlineHour,
        deadlineMinute: settings.deadlineMinute,
        maxMealQty: settings.maxMealQty,
      },
      todayMeal: todayRec,
      tomorrowMeal: tomorrowRec,
      tomorrowLocked,
      tomorrowWorking,
      tomorrowPendingRequest: tomorrowPendingReq,
      monthlyMeals,
      monthlyBillPoisha,
      totalPaidAllPoisha: totalPaidAll,
      remainingDuesPoisha,
      upcomingMeals,
      latestInvoices: allInvoices.slice(0, 3),
      recentPayments,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
