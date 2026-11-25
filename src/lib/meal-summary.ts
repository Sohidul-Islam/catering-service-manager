import { formatBDT } from "@/lib/money";
import {
  formatDateRangeLabel,
  formatLongDate,
  formatMonthYear,
  formatReadableDate,
  getShortDayName,
  parseDateStr,
} from "@/lib/timezone";

export type MealSummaryPeriod = "today" | "tomorrow" | "weekly" | "monthly" | "custom";
export type MealSummaryGuestDisplay = "email" | "name_email" | "name";

export interface MealSummaryGuestItem {
  userId: string;
  name: string;
  email: string;
  status?: string;
  totalMeals: number;
  totalAmountPoisha: number;
  daysCount?: number;
}

export interface MealSummaryDailyItem {
  date: string;
  totalMeals: number;
  guestsCount: number;
  totalAmountPoisha: number;
}

export interface MealSummaryPayload {
  period: MealSummaryPeriod;
  today: string;
  tomorrow: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  organizationName?: string;
  totalMeals: number;
  totalGuestsWithMeals: number;
  totalAmountPoisha: number;
  guests: MealSummaryGuestItem[];
  dailyBreakdown: MealSummaryDailyItem[];
}

export interface MealSummaryFormatOptions {
  guestDisplay?: MealSummaryGuestDisplay;
  includeCost?: boolean;
  includeDailyBreakdown?: boolean;
  includeZeroMealGuests?: boolean;
  customNote?: string;
  signature?: string;
}

export const DEFAULT_SUMMARY_SIGNATURE = "Premium Catering Service (Mediusware Ltd)";

const GENERIC_ORG_NAMES = new Set([
  "",
  "office meal service",
  "office meal management",
]);

export function resolveSummarySignature(organizationName?: string | null): string {
  const trimmed = organizationName?.trim() ?? "";
  if (GENERIC_ORG_NAMES.has(trimmed.toLowerCase())) {
    return DEFAULT_SUMMARY_SIGNATURE;
  }
  return trimmed;
}

function formatGuestLabel(
  guest: Pick<MealSummaryGuestItem, "name" | "email">,
  display: MealSummaryGuestDisplay
): string {
  if (display === "name") return guest.name;
  if (display === "name_email") return `${guest.name} (${guest.email})`;
  return guest.email;
}

export function formatMealSummaryText(
  summary: MealSummaryPayload,
  options?: MealSummaryFormatOptions
): string {
  const guestDisplay: MealSummaryGuestDisplay = options?.guestDisplay ?? "email";
  const includeCost = Boolean(options?.includeCost);
  const includeDailyBreakdown = Boolean(options?.includeDailyBreakdown);
  const includeZeroMealGuests = Boolean(options?.includeZeroMealGuests);

  const isSingleDay = summary.startDate === summary.endDate;
  const { year, month } = parseDateStr(summary.startDate);

  let introLine: string;
  if (isSingleDay && (summary.period === "today" || summary.startDate === summary.today)) {
    introLine = `Here is today's meal summary (${formatLongDate(summary.startDate)}):`;
  } else if (
    isSingleDay &&
    (summary.period === "tomorrow" || summary.startDate === summary.tomorrow)
  ) {
    introLine = `Here is tomorrow's meal summary (${formatLongDate(summary.startDate)}):`;
  } else if (isSingleDay) {
    introLine = `Here is the meal summary (${formatLongDate(summary.startDate)}):`;
  } else if (summary.period === "weekly") {
    introLine = `Here is the weekly meal summary (${formatDateRangeLabel(
      summary.startDate,
      summary.endDate
    )}):`;
  } else if (summary.period === "monthly") {
    introLine = `Here is the monthly meal summary (${formatMonthYear(year, month)}):`;
  } else {
    introLine = `Here is the meal summary (${formatDateRangeLabel(
      summary.startDate,
      summary.endDate
    )}):`;
  }

  const visibleGuests = includeZeroMealGuests
    ? summary.guests
    : summary.guests.filter((g) => g.totalMeals > 0);

  const lines: string[] = ["Hello,", introLine];

  if (visibleGuests.length === 0) {
    lines.push("No confirmed meals for this period.");
  } else {
    visibleGuests.forEach((g, idx) => {
      const label = formatGuestLabel(g, guestDisplay);
      if (isSingleDay) {
        let line = `${idx + 1}. ${label}`;
        if (g.totalMeals !== 1) {
          line += ` (${g.totalMeals} meal${g.totalMeals === 1 ? "" : "s"})`;
        }
        if (includeCost) {
          line += ` — ${formatBDT(g.totalAmountPoisha)}`;
        }
        lines.push(line);
      } else {
        let line = `${idx + 1}. ${label} — ${g.totalMeals} meal${
          g.totalMeals === 1 ? "" : "s"
        }`;
        if (includeCost) {
          line += ` (${formatBDT(g.totalAmountPoisha)})`;
        }
        lines.push(line);
      }
    });
  }

  const activeDaily = summary.dailyBreakdown.filter((d) => d.totalMeals > 0);
  if (!isSingleDay && includeDailyBreakdown && activeDaily.length > 0) {
    lines.push("");
    lines.push("Daily Breakdown:");
    for (const d of activeDaily) {
      let dLine = `- ${getShortDayName(d.date)}, ${formatReadableDate(d.date)}: ${
        d.totalMeals
      } meal${d.totalMeals === 1 ? "" : "s"}`;
      if (includeCost) {
        dLine += ` (${formatBDT(d.totalAmountPoisha)})`;
      }
      lines.push(dLine);
    }
  }

  if (!isSingleDay) {
    const activeGuestsCount = summary.guests.filter((g) => g.totalMeals > 0).length;
    lines.push(`Total Guests: ${activeGuestsCount}`);
  }

  lines.push(`Total Meal: ${summary.totalMeals}`);

  if (includeCost) {
    lines.push(`Total Amount: ${formatBDT(summary.totalAmountPoisha)}`);
  }

  const note = options?.customNote?.trim();
  if (note) {
    lines.push(`Note: ${note}`);
  }

  lines.push("Thank you!");
  lines.push(options?.signature?.trim() || resolveSummarySignature(summary.organizationName));

  return lines.join("\n");
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to execCommand fallback (e.g. non-HTTPS LAN origins)
    }
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is not available in this environment.");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Failed to copy text to clipboard.");
  }
}
