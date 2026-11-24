import { prisma } from "@/lib/prisma";
import { getDayOfWeek, getMonthDateRange } from "@/lib/timezone";
import {
  Holiday,
  MealOverrideScope,
  MealPreference,
  MealRuleHistory,
  MealSource,
  OrganizationSettings,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { logActivity } from "./activity.service";

export async function getSettings(): Promise<OrganizationSettings> {
  const existing = await prisma.organizationSettings.findUnique({
    where: { id: "default" },
  });
  if (existing) return existing;

  return prisma.organizationSettings.create({
    data: {
      id: "default",
      organizationName: "Office Meal Service",
      timezone: "Asia/Dhaka",
      defaultMealPricePoisha: 12000,
      deadlineHour: 23,
      deadlineMinute: 50,
      weekendDays: "6,0",
    },
  });
}

export function parseWeekendDays(weekendDaysStr: string): Set<number> {
  return new Set(
    weekendDaysStr
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
  );
}

export function isWorkingDay(
  dateStr: string,
  settings: Pick<OrganizationSettings, "weekendDays">,
  holidayMap: Map<string, Pick<Holiday, "type" | "allowMeals">>
): boolean {
  const holiday = holidayMap.get(dateStr);
  if (holiday) {
    if (holiday.type === "SPECIAL_WORKING_DAY") {
      return holiday.allowMeals;
    }
    return holiday.allowMeals;
  }

  const weekends = parseWeekendDays(settings.weekendDays);
  const dow = getDayOfWeek(dateStr);
  return !weekends.has(dow);
}

export function resolveMealPrice(
  dateStr: string,
  settings: Pick<OrganizationSettings, "defaultMealPricePoisha">,
  priceMap: Map<string, number>
): number {
  return priceMap.get(dateStr) ?? settings.defaultMealPricePoisha;
}

export function resolveEffectiveMealRule(
  guest: {
    mealPreference: MealPreference;
    defaultMealQty: number;
    mealStartDate: string | null;
  },
  dateStr: string,
  followingRules: Pick<MealRuleHistory, "effectiveFrom" | "quantity" | "createdAt">[]
): {
  quantity: number;
  source: MealSource;
  overrideScope: MealOverrideScope | null;
} | null {
  // Never generate or assign meals before the guest's Meal Start Date
  if (guest.mealStartDate && dateStr < guest.mealStartDate) {
    return null;
  }

  // Find latest FOLLOWING_DATES rule with effectiveFrom <= dateStr
  let latestRule: Pick<MealRuleHistory, "effectiveFrom" | "quantity" | "createdAt"> | null = null;
  for (const r of followingRules) {
    if (r.effectiveFrom <= dateStr) {
      if (
        !latestRule ||
        r.effectiveFrom > latestRule.effectiveFrom ||
        (r.effectiveFrom === latestRule.effectiveFrom && r.createdAt > latestRule.createdAt)
      ) {
        latestRule = r;
      }
    }
  }

  if (latestRule) {
    return {
      quantity: Math.max(0, latestRule.quantity),
      source: MealSource.FOLLOWING_RULE,
      overrideScope: MealOverrideScope.FOLLOWING_DATES,
    };
  }

  return {
    quantity:
      guest.mealPreference === MealPreference.REGULAR ? Math.max(0, guest.defaultMealQty) : 0,
    source: MealSource.DEFAULT,
    overrideScope: null,
  };
}

/**
 * Idempotently generates the monthly meal schedule for all active guests.
 * - Excludes dates before each guest's mealStartDate
 * - Excludes weekends and holidays (unless special working day / allowMeals = true)
 * - Applies latest FOLLOWING_DATES rule or guest's Regular/Occasional default
 * - Never duplicates records and never overwrites existing MealRecords
 */
export async function ensureMonthSchedule(
  year: number,
  month: number,
  actorId?: string | null,
  forceLog = false
) {
  const settings = await getSettings();
  const dates = getMonthDateRange(year, month);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const [existingSchedule, holidays, mealPrices, activeGuests, existingRecords, followingRules] =
    await Promise.all([
      prisma.monthlyMealSchedule.findUnique({
        where: { year_month: { year, month } },
      }),
      prisma.holiday.findMany({
        where: { date: { gte: startDate, lte: endDate } },
      }),
      prisma.mealPrice.findMany({
        where: { date: { gte: startDate, lte: endDate } },
      }),
      prisma.user.findMany({
        where: { role: UserRole.GUEST, status: UserStatus.ACTIVE },
        select: {
          id: true,
          mealPreference: true,
          defaultMealQty: true,
          mealStartDate: true,
        },
      }),
      prisma.mealRecord.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        select: { userId: true, date: true },
      }),
      prisma.mealRuleHistory.findMany({
        where: {
          scope: MealOverrideScope.FOLLOWING_DATES,
          effectiveFrom: { lte: endDate },
        },
        select: {
          userId: true,
          effectiveFrom: true,
          quantity: true,
          createdAt: true,
        },
      }),
    ]);

  const holidayMap = new Map(holidays.map((h) => [h.date, h]));
  const priceMap = new Map(mealPrices.map((p) => [p.date, p.pricePoisha]));
  const existingSet = new Set(existingRecords.map((r) => `${r.userId}::${r.date}`));

  const rulesByGuest = new Map<
    string,
    Pick<MealRuleHistory, "effectiveFrom" | "quantity" | "createdAt">[]
  >();
  for (const r of followingRules) {
    const list = rulesByGuest.get(r.userId) ?? [];
    list.push(r);
    rulesByGuest.set(r.userId, list);
  }

  const toCreate: {
    userId: string;
    date: string;
    quantity: number;
    unitPricePoisha: number;
    source: MealSource;
    overrideScope: MealOverrideScope | null;
    isCustomized: boolean;
    isFinalized: boolean;
  }[] = [];

  for (const dateStr of dates) {
    const working = isWorkingDay(dateStr, settings, holidayMap);
    const unitPricePoisha = resolveMealPrice(dateStr, settings, priceMap);

    for (const guest of activeGuests) {
      const key = `${guest.id}::${dateStr}`;
      if (existingSet.has(key)) continue;

      const rule = resolveEffectiveMealRule(guest, dateStr, rulesByGuest.get(guest.id) ?? []);
      if (!rule) {
        // Date is strictly before guest's mealStartDate: do NOT create any MealRecord
        continue;
      }

      toCreate.push({
        userId: guest.id,
        date: dateStr,
        quantity: working ? rule.quantity : 0,
        unitPricePoisha,
        source: rule.source,
        overrideScope: rule.overrideScope,
        isCustomized: false,
        isFinalized: false,
      });
    }
  }

  if (toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const item of toCreate) {
        await tx.mealRecord.upsert({
          where: { userId_date: { userId: item.userId, date: item.date } },
          update: {},
          create: item,
        });
      }
    });
  }

  let schedule = existingSchedule;
  if (!schedule) {
    schedule = await prisma.monthlyMealSchedule.create({
      data: {
        year,
        month,
        generatedById: actorId ?? null,
      },
    });
  } else if (forceLog) {
    schedule = await prisma.monthlyMealSchedule.update({
      where: { id: schedule.id },
      data: { generatedAt: new Date(), generatedById: actorId ?? schedule.generatedById },
    });
  }

  if ((!existingSchedule || forceLog || toCreate.length > 0) && actorId) {
    await logActivity({
      actorId,
      action: "GENERATE_MONTHLY_SCHEDULE",
      entityType: "MonthlyMealSchedule",
      entityId: schedule.id,
      newValue: JSON.stringify({ year, month, createdRecords: toCreate.length }),
    });
  }

  return { schedule, createdCount: toCreate.length };
}

/**
 * Generates remaining/missing schedule records for a newly activated guest
 * from their mealStartDate onward without touching any other guest's records.
 */
export async function syncGuestMonthSchedule(userId: string, year: number, month: number) {
  const guest = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      role: true,
      mealPreference: true,
      defaultMealQty: true,
      mealStartDate: true,
    },
  });
  if (!guest || guest.role !== UserRole.GUEST || guest.status !== UserStatus.ACTIVE) {
    return 0;
  }

  const settings = await getSettings();
  const dates = getMonthDateRange(year, month);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const [holidays, mealPrices, existingRecords, followingRules] = await Promise.all([
    prisma.holiday.findMany({ where: { date: { gte: startDate, lte: endDate } } }),
    prisma.mealPrice.findMany({ where: { date: { gte: startDate, lte: endDate } } }),
    prisma.mealRecord.findMany({
      where: { userId, date: { gte: startDate, lte: endDate } },
      select: { date: true },
    }),
    prisma.mealRuleHistory.findMany({
      where: {
        userId,
        scope: MealOverrideScope.FOLLOWING_DATES,
        effectiveFrom: { lte: endDate },
      },
      select: { effectiveFrom: true, quantity: true, createdAt: true },
    }),
  ]);

  const holidayMap = new Map(holidays.map((h) => [h.date, h]));
  const priceMap = new Map(mealPrices.map((p) => [p.date, p.pricePoisha]));
  const existingSet = new Set(existingRecords.map((r) => r.date));

  let created = 0;
  for (const dateStr of dates) {
    if (existingSet.has(dateStr)) continue;
    const rule = resolveEffectiveMealRule(guest, dateStr, followingRules);
    if (!rule) continue;

    const working = isWorkingDay(dateStr, settings, holidayMap);
    const unitPricePoisha = resolveMealPrice(dateStr, settings, priceMap);

    await prisma.mealRecord.upsert({
      where: { userId_date: { userId, date: dateStr } },
      update: {},
      create: {
        userId,
        date: dateStr,
        quantity: working ? rule.quantity : 0,
        unitPricePoisha,
        source: rule.source,
        overrideScope: rule.overrideScope,
        isCustomized: false,
        isFinalized: false,
      },
    });
    created++;
  }

  return created;
}
