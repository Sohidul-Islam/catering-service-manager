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

  // If guest has not set a Meal Start Date yet, do not auto-schedule default meals
  if (!guest.mealStartDate) {
    return null;
  }

  return {
    quantity:
      guest.mealPreference === MealPreference.REGULAR ? Math.max(0, guest.defaultMealQty) : 0,
    source: MealSource.DEFAULT,
    overrideScope: null,
  };
}

type MealRecordCreateInput = {
  userId: string;
  date: string;
  quantity: number;
  unitPricePoisha: number;
  source: MealSource;
  overrideScope: MealOverrideScope | null;
  isCustomized: boolean;
  isFinalized: boolean;
};

/**
 * Inserts meal records in batches to avoid interactive transaction timeouts on
 * remote LibSQL/Turso, falling back to upserts only if a concurrent request races.
 */
async function insertMealRecordsIdempotently(records: MealRecordCreateInput[]): Promise<void> {
  if (records.length === 0) return;

  const CHUNK_SIZE = 50;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    try {
      await prisma.mealRecord.createMany({ data: chunk });
    } catch (error: unknown) {
      const code = (error as { code?: string } | null)?.code;
      if (code !== "P2002") {
        throw error;
      }
      for (const item of chunk) {
        await prisma.mealRecord.upsert({
          where: { userId_date: { userId: item.userId, date: item.date } },
          update: {},
          create: item,
        });
      }
    }
  }
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
  forceLog = false,
  existingSettings?: OrganizationSettings
) {
  const existingSchedule = await prisma.monthlyMealSchedule.findUnique({
    where: { year_month: { year, month } },
  });

  if (existingSchedule && !forceLog) {
    return { schedule: existingSchedule, createdCount: 0 };
  }

  const dates = getMonthDateRange(year, month);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const [settings, holidays, mealPrices, activeGuests, existingRecords, followingRules] =
    await Promise.all([
      existingSettings ? Promise.resolve(existingSettings) : getSettings(),
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

  const toCreate: MealRecordCreateInput[] = [];

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

  await insertMealRecordsIdempotently(toCreate);

  const schedule =
    !existingSchedule || forceLog
      ? await prisma.monthlyMealSchedule.upsert({
          where: { year_month: { year, month } },
          update: forceLog
            ? {
                generatedAt: new Date(),
                generatedById: actorId ?? existingSchedule?.generatedById ?? null,
              }
            : {},
          create: {
            year,
            month,
            generatedById: actorId ?? null,
          },
        })
      : existingSchedule;

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

async function syncGuestSingleMonth(
  guest: {
    id: string;
    mealPreference: MealPreference;
    defaultMealQty: number;
    mealStartDate: string | null;
  },
  settings: OrganizationSettings,
  year: number,
  month: number
) {
  const dates = getMonthDateRange(year, month);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const [holidays, mealPrices, existingRecords, followingRules] = await Promise.all([
    prisma.holiday.findMany({ where: { date: { gte: startDate, lte: endDate } } }),
    prisma.mealPrice.findMany({ where: { date: { gte: startDate, lte: endDate } } }),
    prisma.mealRecord.findMany({
      where: { userId: guest.id, date: { gte: startDate, lte: endDate } },
      select: { date: true },
    }),
    prisma.mealRuleHistory.findMany({
      where: {
        userId: guest.id,
        scope: MealOverrideScope.FOLLOWING_DATES,
        effectiveFrom: { lte: endDate },
      },
      select: { effectiveFrom: true, quantity: true, createdAt: true },
    }),
  ]);

  const holidayMap = new Map(holidays.map((h) => [h.date, h]));
  const priceMap = new Map(mealPrices.map((p) => [p.date, p.pricePoisha]));
  const existingSet = new Set(existingRecords.map((r) => r.date));

  const toCreate: MealRecordCreateInput[] = [];
  for (const dateStr of dates) {
    if (existingSet.has(dateStr)) continue;
    const rule = resolveEffectiveMealRule(guest, dateStr, followingRules);
    if (!rule) continue;

    const working = isWorkingDay(dateStr, settings, holidayMap);
    const unitPricePoisha = resolveMealPrice(dateStr, settings, priceMap);

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

  await insertMealRecordsIdempotently(toCreate);
  return toCreate.length;
}

/**
 * Generates remaining/missing schedule records for a newly activated guest
 * from their mealStartDate onward (including any pre-generated future months)
 * without touching any other guest's records.
 */
export async function syncGuestMonthSchedule(userId: string, year: number, month: number) {
  const [guest, settings, futureSchedules] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        role: true,
        mealPreference: true,
        defaultMealQty: true,
        mealStartDate: true,
      },
    }),
    getSettings(),
    prisma.monthlyMealSchedule.findMany({
      where: {
        OR: [{ year: { gt: year } }, { year, month: { gt: month } }],
      },
      select: { year: true, month: true },
    }),
  ]);
  if (!guest || guest.role !== UserRole.GUEST || guest.status !== UserStatus.ACTIVE) {
    return 0;
  }

  const targetMonths = [{ year, month }, ...futureSchedules];
  const counts = await Promise.all(
    targetMonths.map((m) => syncGuestSingleMonth(guest, settings, m.year, m.month))
  );

  return counts.reduce((sum, c) => sum + c, 0);
}
