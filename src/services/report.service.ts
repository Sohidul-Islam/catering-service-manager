import { prisma } from "@/lib/prisma";
import {
  getDateRange,
  getMonthDateRange,
  getNextDateStr,
  getNowInTimezone,
  getWeekDateRange,
  parseDateStr,
} from "@/lib/timezone";
import { InvoiceStatus, UserRole, UserStatus } from "@prisma/client";
import { ensureMonthSchedule, getSettings, isWorkingDay } from "./schedule.service";
import type {
  MealSummaryDailyItem,
  MealSummaryGuestItem,
  MealSummaryPayload,
  MealSummaryPeriod,
} from "@/lib/meal-summary";

export async function getMonthlyReport(params: {
  year: number;
  month: number;
  startDate?: string;
  endDate?: string;
  guestId?: string;
  status?: InvoiceStatus;
}) {
  const { year, month, guestId, status } = params;
  const monthDates = getMonthDateRange(year, month);
  const startDate = params.startDate || monthDates[0];
  const endDate = params.endDate || monthDates[monthDates.length - 1];
  const dates = startDate <= endDate ? getDateRange(startDate, endDate) : monthDates;

  const [settings, holidays, records, invoices] = await Promise.all([
    getSettings(),
    prisma.holiday.findMany({ where: { date: { gte: startDate, lte: endDate } } }),
    prisma.mealRecord.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        ...(guestId ? { userId: guestId } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true, status: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.invoice.findMany({
      where: {
        year,
        month,
        ...(guestId ? { userId: guestId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const holidayMap = new Map(holidays.map((h) => [h.date, h]));
  const totalWorkingDays = dates.filter((d) => isWorkingDay(d, settings, holidayMap)).length;

  let totalMeals = 0;
  let totalExpectedAmountPoisha = 0;

  const dailyMap = new Map<string, { date: string; meals: number; amountPoisha: number }>();
  const guestMap = new Map<
    string,
    { userId: string; name: string; email: string; totalMeals: number; totalAmountPoisha: number }
  >();

  for (const r of records) {
    totalMeals += r.quantity;
    const amt = r.quantity * r.unitPricePoisha;
    totalExpectedAmountPoisha += amt;

    const d = dailyMap.get(r.date) ?? { date: r.date, meals: 0, amountPoisha: 0 };
    d.meals += r.quantity;
    d.amountPoisha += amt;
    dailyMap.set(r.date, d);

    const g = guestMap.get(r.userId) ?? {
      userId: r.userId,
      name: r.user.name,
      email: r.user.email,
      totalMeals: 0,
      totalAmountPoisha: 0,
    };
    g.totalMeals += r.quantity;
    g.totalAmountPoisha += amt;
    guestMap.set(r.userId, g);
  }

  let totalInvoicedPoisha = 0;
  let totalCollectedPoisha = 0;
  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;

  for (const inv of invoices) {
    totalInvoicedPoisha += inv.totalAmountPoisha;
    totalCollectedPoisha += inv.paidAmountPoisha;
    if (inv.status === InvoiceStatus.PAID) paidCount++;
    else if (inv.status === InvoiceStatus.PARTIALLY_PAID) partialCount++;
    else unpaidCount++;
  }

  const allGuests = await prisma.user.findMany({
    where: { role: UserRole.GUEST },
    select: { id: true, name: true, email: true, status: true },
    orderBy: { name: "asc" },
  });

  const dateWiseHistory = guestId
    ? records.map((r) => ({
        id: r.id,
        date: r.date,
        quantity: r.quantity,
        unitPricePoisha: r.unitPricePoisha,
        totalPoisha: r.quantity * r.unitPricePoisha,
      }))
    : [];

  return {
    mealReport: {
      totalWorkingDays,
      totalMeals,
      totalExpectedAmountPoisha,
      dailyBreakdown: Array.from(dailyMap.values()),
      guestBreakdown: Array.from(guestMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      dateWiseHistory,
    },
    financialReport: {
      totalInvoicedPoisha,
      totalCollectedPoisha,
      totalOutstandingPoisha: Math.max(0, totalInvoicedPoisha - totalCollectedPoisha),
      paidCount,
      partialCount,
      unpaidCount,
      invoices,
    },
    guests: allGuests,
  };
}

export async function getMealSummary(params: {
  period: MealSummaryPeriod;
  date?: string;
  year?: number;
  month?: number;
  startDate?: string;
  endDate?: string;
}): Promise<MealSummaryPayload> {
  const settings = await getSettings();
  const now = getNowInTimezone(settings.timezone);
  const tomorrow = getNextDateStr(now.dateStr);

  let startDate: string;
  let endDate: string;

  if (params.period === "today") {
    const target = params.date || now.dateStr;
    startDate = target;
    endDate = target;
  } else if (params.period === "tomorrow") {
    startDate = tomorrow;
    endDate = tomorrow;
  } else if (params.period === "weekly") {
    const week = getWeekDateRange(params.date || now.dateStr);
    startDate = week.startDate;
    endDate = week.endDate;
  } else if (params.period === "monthly") {
    const targetYear = params.year ?? now.year;
    const targetMonth = params.month ?? now.month;
    const monthDates = getMonthDateRange(targetYear, targetMonth);
    startDate = monthDates[0];
    endDate = monthDates[monthDates.length - 1];
  } else {
    const s = params.startDate || params.date || now.dateStr;
    const e = params.endDate || s;
    if (s > e) {
      throw new Error("Start date must be on or before end date.");
    }
    startDate = s;
    endDate = e;
  }

  const sParsed = parseDateStr(startDate);
  const eParsed = parseDateStr(endDate);
  const dayCount =
    Math.floor(
      (Date.UTC(eParsed.year, eParsed.month - 1, eParsed.day) -
        Date.UTC(sParsed.year, sParsed.month - 1, sParsed.day)) /
        86_400_000
    ) + 1;

  if (dayCount <= 62) {
    let curY = sParsed.year;
    let curM = sParsed.month;
    while (curY < eParsed.year || (curY === eParsed.year && curM <= eParsed.month)) {
      await ensureMonthSchedule(curY, curM, null, false, settings);
      if (curM === 12) {
        curY += 1;
        curM = 1;
      } else {
        curM += 1;
      }
    }
  }

  const [records, activeGuests] = await Promise.all([
    prisma.mealRecord.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        quantity: { gt: 0 },
        user: { role: UserRole.GUEST },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, status: true },
        },
      },
      orderBy: [{ date: "asc" }, { user: { name: "asc" } }],
    }),
    prisma.user.findMany({
      where: { role: UserRole.GUEST, status: UserStatus.ACTIVE },
      select: { id: true, name: true, email: true, status: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const guestMap = new Map<string, MealSummaryGuestItem>();
  for (const g of activeGuests) {
    guestMap.set(g.id, {
      userId: g.id,
      name: g.name,
      email: g.email,
      status: g.status,
      totalMeals: 0,
      totalAmountPoisha: 0,
      daysCount: 0,
    });
  }

  const dailyMap = new Map<
    string,
    { date: string; totalMeals: number; guestIds: Set<string>; totalAmountPoisha: number }
  >();

  for (const r of records) {
    const amountPoisha = r.quantity * r.unitPricePoisha;
    const existingGuest = guestMap.get(r.userId) ?? {
      userId: r.userId,
      name: r.user.name,
      email: r.user.email,
      status: r.user.status,
      totalMeals: 0,
      totalAmountPoisha: 0,
      daysCount: 0,
    };
    existingGuest.totalMeals += r.quantity;
    existingGuest.totalAmountPoisha += amountPoisha;
    existingGuest.daysCount = (existingGuest.daysCount ?? 0) + 1;
    guestMap.set(r.userId, existingGuest);

    const daily = dailyMap.get(r.date) ?? {
      date: r.date,
      totalMeals: 0,
      guestIds: new Set<string>(),
      totalAmountPoisha: 0,
    };
    daily.totalMeals += r.quantity;
    daily.guestIds.add(r.userId);
    daily.totalAmountPoisha += amountPoisha;
    dailyMap.set(r.date, daily);
  }

  const guests = Array.from(guestMap.values()).sort(
    (a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email)
  );

  const dailyBreakdown: MealSummaryDailyItem[] = Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      totalMeals: d.totalMeals,
      guestsCount: d.guestIds.size,
      totalAmountPoisha: d.totalAmountPoisha,
    }));

  const totalMeals = guests.reduce((s, g) => s + g.totalMeals, 0);
  const totalGuestsWithMeals = guests.filter((g) => g.totalMeals > 0).length;
  const totalAmountPoisha = guests.reduce((s, g) => s + g.totalAmountPoisha, 0);

  return {
    period: params.period,
    today: now.dateStr,
    tomorrow,
    startDate,
    endDate,
    timezone: settings.timezone,
    organizationName: settings.organizationName,
    totalMeals,
    totalGuestsWithMeals,
    totalAmountPoisha,
    guests,
    dailyBreakdown,
  };
}

export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (val: string | number) => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}
