import { prisma } from "@/lib/prisma";
import {
  ensureMonthSchedule,
  getSettings,
  isWorkingDay,
  reconcileClosedDayRecordsInMemory,
} from "@/services/schedule.service";
import {
  getMonthDateRange,
  getNowInTimezone,
  getTomorrowDateStr,
  isPastMealDeadline,
} from "@/lib/timezone";
import { AdjustmentStatus } from "@prisma/client";

export async function getGuestDashboardData(userId: string) {
  const settings = await getSettings();
  const now = getNowInTimezone(settings.timezone);
  const tomorrow = getTomorrowDateStr(settings.timezone);

  await ensureMonthSchedule(now.year, now.month, null, false, settings);

  const monthDates = getMonthDateRange(now.year, now.month);
  const startDate = monthDates[0];
  const endDate = monthDates[monthDates.length - 1];

  const [monthRecords, allInvoices, recentPayments, holidays, tomorrowPendingReq] =
    await Promise.all([
      prisma.mealRecord.findMany({
        where: { userId, date: { gte: startDate, lte: endDate } },
        orderBy: { date: "asc" },
      }),
      prisma.invoice.findMany({
        where: { userId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
      prisma.payment.findMany({
        where: { userId },
        orderBy: { paidAt: "desc" },
        take: 5,
        include: { invoice: { select: { invoiceNumber: true } } },
      }),
      prisma.holiday.findMany({
        where: { date: { gte: startDate, lte: endDate } },
      }),
      prisma.mealAdjustmentRequest.findFirst({
        where: { userId, date: tomorrow, status: AdjustmentStatus.PENDING },
      }),
    ]);

  const holidayMap = new Map(holidays.map((h) => [h.date, h]));
  await reconcileClosedDayRecordsInMemory(monthRecords, settings, holidayMap);
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

  const totalBilledAllPoisha = allInvoices.reduce((s, i) => s + i.totalAmountPoisha, 0);
  const totalPaidAllPoisha = allInvoices.reduce((s, i) => s + i.paidAmountPoisha, 0);
  const remainingDuesPoisha = Math.max(0, totalBilledAllPoisha - totalPaidAllPoisha);

  const upcomingMeals = monthRecords
    .filter((r) => r.date >= now.dateStr)
    .slice(0, 7);

  return {
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
    totalBilledAllPoisha,
    totalPaidAllPoisha,
    remainingDuesPoisha,
    upcomingMeals,
    latestInvoices: allInvoices.slice(0, 3),
    recentPayments,
  };
}
