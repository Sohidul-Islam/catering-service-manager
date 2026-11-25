/**
 * Timezone-safe date and deadline utilities.
 * All meal/holiday/price dates use YYYY-MM-DD strings.
 */

export interface ZonedNow {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  dateStr: string; // YYYY-MM-DD
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseDateStr(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function getNowInTimezone(timezone = "Asia/Dhaka", now: Date = new Date()): ZonedNow {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hour = get("hour");
  if (hour === 24) hour = 0;
  const minute = get("minute");

  return {
    year,
    month,
    day,
    hour,
    minute,
    dateStr: formatDateStr(year, month, day),
  };
}

export function getPreviousDateStr(dateStr: string): string {
  const { year, month, day } = parseDateStr(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day - 1));
  return formatDateStr(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function getNextDateStr(dateStr: string): string {
  const { year, month, day } = parseDateStr(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day + 1));
  return formatDateStr(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function getTomorrowDateStr(timezone = "Asia/Dhaka", now: Date = new Date()): string {
  const current = getNowInTimezone(timezone, now);
  return getNextDateStr(current.dateStr);
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getMonthDateRange(year: number, month: number): string[] {
  const days = getDaysInMonth(year, month);
  const result: string[] = [];
  for (let d = 1; d <= days; d++) {
    result.push(formatDateStr(year, month, d));
  }
  return result;
}

export function getDateRange(startDateStr: string, endDateStr: string): string[] {
  const result: string[] = [];
  let cur = startDateStr;
  while (cur <= endDateStr) {
    result.push(cur);
    cur = getNextDateStr(cur);
  }
  return result;
}

export function addDays(dateStr: string, deltaDays: number): string {
  const { year, month, day } = parseDateStr(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return formatDateStr(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

/**
 * Returns the Sunday..Saturday week range containing `dateStr`.
 */
export function getWeekDateRange(dateStr: string): { startDate: string; endDate: string } {
  const dow = getDayOfWeek(dateStr); // 0 = Sun .. 6 = Sat
  const startDate = addDays(dateStr, -dow);
  const endDate = addDays(startDate, 6);
  return { startDate, endDate };
}

/**
 * 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */
export function getDayOfWeek(dateStr: string): number {
  const { year, month, day } = parseDateStr(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function getDayName(dateStr: string): string {
  const { year, month, day } = parseDateStr(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
}

export function getShortDayName(dateStr: string): string {
  const { year, month, day } = parseDateStr(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export function formatReadableDate(dateStr: string): string {
  const { year, month, day } = parseDateStr(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatLongDate(dateStr: string): string {
  const { year, month, day } = parseDateStr(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatMonthYear(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateRangeLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) {
    return formatLongDate(startDate);
  }
  const s = parseDateStr(startDate);
  const e = parseDateStr(endDate);
  if (s.year === e.year) {
    const startNoYear = new Date(Date.UTC(s.year, s.month - 1, s.day)).toLocaleDateString(
      "en-US",
      {
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }
    );
    return `${startNoYear} – ${formatLongDate(endDate)}`;
  }
  return `${formatLongDate(startDate)} – ${formatLongDate(endDate)}`;
}

/**
 * Checks if current time in `timezone` is at or past `(mealDateStr - 1 day) at deadlineHour:deadlineMinute`.
 */
export function isPastMealDeadline(
  mealDateStr: string,
  deadlineHour = 23,
  deadlineMinute = 50,
  timezone = "Asia/Dhaka",
  now: Date = new Date()
): boolean {
  const zoned = getNowInTimezone(timezone, now);
  const deadlineDateStr = getPreviousDateStr(mealDateStr);

  if (zoned.dateStr > deadlineDateStr) {
    return true;
  }
  if (zoned.dateStr < deadlineDateStr) {
    return false;
  }

  // Same date as deadlineDateStr
  if (zoned.hour > deadlineHour) return true;
  if (zoned.hour < deadlineHour) return false;
  return zoned.minute >= deadlineMinute;
}
