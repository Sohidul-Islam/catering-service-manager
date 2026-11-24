import { prisma } from "@/lib/prisma";
import { getDateRange, getMonthDateRange } from "@/lib/timezone";
import { InvoiceStatus, UserRole } from "@prisma/client";
import { getSettings, isWorkingDay } from "./schedule.service";

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
