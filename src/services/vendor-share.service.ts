import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  getDateRange,
  getDayOfWeek,
  getMonthDateRange,
  getNextDateStr,
  getNowInTimezone,
  parseDateStr,
} from "@/lib/timezone";
import {
  cleanupClosedDayRecords,
  ensureMonthSchedule,
  getSettings,
  isWorkingDay,
} from "./schedule.service";
import { logActivity } from "./activity.service";
import { UserRole } from "@prisma/client";

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOKEN_LENGTH = 6;

export class VendorShareError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function generateShortVendorToken(length = TOKEN_LENGTH): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

export function buildVendorShareUrl(token: string, origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(
    /\/$/,
    ""
  );
  return `${base}/vendor-meals/${token}`;
}

async function createUniqueVendorToken(year: number, month: number, actorId: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateShortVendorToken();
    try {
      const created = await prisma.vendorShareToken.create({
        data: {
          token: candidate,
          year,
          month,
          createdById: actorId,
        },
      });
      await logActivity({
        actorId,
        action: "GENERATE_VENDOR_SHARE_LINK",
        entityType: "VendorShareToken",
        entityId: created.id,
        newValue: JSON.stringify({ year, month, token: created.token }),
      });
      return created;
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "P2002") continue;
      throw err;
    }
  }
  throw new VendorShareError("Could not generate a unique vendor token. Please retry.", 500);
}

export async function getOrCreateCurrentVendorToken(actorId: string) {
  const settings = await getSettings();
  const now = getNowInTimezone(settings.timezone);

  const existing = await prisma.vendorShareToken.findFirst({
    where: { year: now.year, month: now.month, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return existing;
  }

  return createUniqueVendorToken(now.year, now.month, actorId);
}

export async function regenerateCurrentVendorToken(actorId: string) {
  const settings = await getSettings();
  const now = getNowInTimezone(settings.timezone);

  await prisma.vendorShareToken.updateMany({
    where: { year: now.year, month: now.month, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return createUniqueVendorToken(now.year, now.month, actorId);
}

export interface VendorDayMealCount {
  date: string;
  dayOfWeek: string;
  isWorkingDay: boolean;
  isToday: boolean;
  isTomorrow: boolean;
  holidayName: string | null;
  totalMeals: number;
}

export interface PublicVendorMealSummary {
  organizationName: string;
  timezone: string;
  year: number;
  month: number;
  monthLabel: string;
  today: string;
  tomorrow: string;
  todayMeals: number;
  tomorrowMeals: number;
  monthTotalMeals: number;
  days: VendorDayMealCount[];
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function getPublicVendorMealSummary(
  rawToken: string
): Promise<PublicVendorMealSummary> {
  const normalizedToken = rawToken.trim().toUpperCase();
  if (!normalizedToken || normalizedToken.length < 3 || normalizedToken.length > 6) {
    throw new VendorShareError("Invalid vendor share token.", 404);
  }

  const [record, settings] = await Promise.all([
    prisma.vendorShareToken.findUnique({ where: { token: normalizedToken } }),
    getSettings(),
  ]);

  if (!record || record.revokedAt) {
    throw new VendorShareError("This vendor link is invalid or has been revoked.", 404);
  }

  const now = getNowInTimezone(settings.timezone);
  if (record.year !== now.year || record.month !== now.month) {
    throw new VendorShareError(
      "This vendor link was for an earlier month and has expired. Please request the current month's link from the admin.",
      410
    );
  }

  const today = now.dateStr;
  const tomorrow = getNextDateStr(today);
  const tomorrowParsed = parseDateStr(tomorrow);

  // Ensure current month (and next month if tomorrow crosses month boundary) schedules exist
  await ensureMonthSchedule(now.year, now.month, null, false, settings);
  if (tomorrowParsed.year !== now.year || tomorrowParsed.month !== now.month) {
    await ensureMonthSchedule(tomorrowParsed.year, tomorrowParsed.month, null, false, settings);
  }

  const monthDates = getMonthDateRange(now.year, now.month);
  const startDate = monthDates[0];
  const endDate = monthDates[monthDates.length - 1];
  const queryEndDate = tomorrow > endDate ? tomorrow : endDate;

  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: startDate, lte: queryEndDate } },
  });
  const holidayMap = new Map(holidays.map((h) => [h.date, h]));
  const closedDates = getDateRange(startDate, queryEndDate).filter(
    (d) => !isWorkingDay(d, settings, holidayMap)
  );
  await cleanupClosedDayRecords(closedDates);

  const groupedCounts = await prisma.mealRecord.groupBy({
    by: ["date"],
    where: {
      date: { gte: startDate, lte: queryEndDate },
      quantity: { gt: 0 },
      user: { role: UserRole.GUEST },
    },
    _sum: { quantity: true },
  });

  const countByDate = new Map<string, number>();
  for (const row of groupedCounts) {
    countByDate.set(row.date, row._sum.quantity ?? 0);
  }

  let monthTotalMeals = 0;
  const days: VendorDayMealCount[] = monthDates.map((dateStr) => {
    const totalMeals = countByDate.get(dateStr) ?? 0;
    monthTotalMeals += totalMeals;
    const dow = getDayOfWeek(dateStr);
    const holiday = holidayMap.get(dateStr);
    return {
      date: dateStr,
      dayOfWeek: WEEKDAY_NAMES[dow] ?? "",
      isWorkingDay: isWorkingDay(dateStr, settings, holidayMap),
      isToday: dateStr === today,
      isTomorrow: dateStr === tomorrow,
      holidayName: holiday ? holiday.name : null,
      totalMeals,
    };
  });

  const todayMeals = countByDate.get(today) ?? 0;
  const tomorrowMeals = countByDate.get(tomorrow) ?? 0;

  const monthLabel = new Date(now.year, now.month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return {
    organizationName: settings.organizationName,
    timezone: settings.timezone,
    year: now.year,
    month: now.month,
    monthLabel,
    today,
    tomorrow,
    todayMeals,
    tomorrowMeals,
    monthTotalMeals,
    days,
  };
}
