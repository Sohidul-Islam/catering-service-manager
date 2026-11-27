import { prisma } from "@/lib/prisma";
import { isPastMealDeadline, getMonthDateRange, parseDateStr } from "@/lib/timezone";
import {
  AdjustmentStatus,
  MealOverrideScope,
  MealSource,
  UserRole,
} from "@prisma/client";
import { logActivity } from "./activity.service";
import {
  getSettings,
  isInvalidClosedDayRecord,
  isWorkingDay,
  resetClosedDayRecordsByIds,
  resolveMealPrice,
} from "./schedule.service";
import { recalculateInvoice } from "./invoice.service";

export class MealServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface UpdateMealInput {
  actorId: string;
  actorRole: UserRole;
  targetUserId: string;
  date: string;
  quantity: number;
  scope?: "SINGLE_DATE" | "FOLLOWING_DATES";
  reason?: string;
  now?: Date; // optional for deterministic testing
}

export async function updateMealQuantity(input: UpdateMealInput) {
  const {
    actorId,
    actorRole,
    targetUserId,
    date,
    quantity,
    scope = "SINGLE_DATE",
    reason,
    now,
  } = input;

  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MealServiceError("Meal quantity must be a non-negative integer.", 400);
  }

  if (actorRole === UserRole.GUEST && actorId !== targetUserId) {
    throw new MealServiceError("Forbidden. Guests can only modify their own meals.", 403);
  }

  const [settings, targetUser, holiday, mealPriceRecord] = await Promise.all([
    getSettings(),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, status: true, role: true, mealStartDate: true },
    }),
    prisma.holiday.findUnique({ where: { date } }),
    prisma.mealPrice.findUnique({ where: { date } }),
  ]);

  if (settings.maxMealQty != null && quantity > settings.maxMealQty) {
    throw new MealServiceError(
      `Meal quantity cannot exceed maximum allowed (${settings.maxMealQty}).`,
      400
    );
  }

  if (!targetUser) {
    throw new MealServiceError("Guest not found.", 404);
  }

  if (
    targetUser.mealStartDate &&
    date < targetUser.mealStartDate &&
    actorRole !== UserRole.ADMIN
  ) {
    throw new MealServiceError(
      `Cannot modify meals before your meal start date (${targetUser.mealStartDate}).`,
      400
    );
  }

  const holidayMap = new Map(holiday ? [[holiday.date, holiday]] : []);
  const working = isWorkingDay(date, settings, holidayMap);

  if (!working && quantity > 0 && actorRole !== UserRole.ADMIN) {
    throw new MealServiceError(
      "Meals cannot be enabled on weekends or holidays unless marked as a working day by an admin.",
      400
    );
  }

  const locked = isPastMealDeadline(
    date,
    settings.deadlineHour,
    settings.deadlineMinute,
    settings.timezone,
    now
  );

  if (locked && actorRole !== UserRole.ADMIN) {
    throw new MealServiceError(
      `Deadline passed (${String(settings.deadlineHour).padStart(2, "0")}:${String(
        settings.deadlineMinute
      ).padStart(2, "0")} ${settings.timezone} the day before). Submit a late adjustment request instead.`,
      409
    );
  }

  const priceMap = new Map(mealPriceRecord ? [[date, mealPriceRecord.pricePoisha]] : []);
  const resolvedPrice = resolveMealPrice(date, settings, priceMap);

  const source =
    actorRole === UserRole.ADMIN ? MealSource.ADMIN_OVERRIDE : MealSource.GUEST_OVERRIDE;
  const overrideScope =
    scope === "FOLLOWING_DATES"
      ? MealOverrideScope.FOLLOWING_DATES
      : MealOverrideScope.SINGLE_DATE;

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.mealRecord.findUnique({
      where: { userId_date: { userId: targetUserId, date } },
    });

    const previousQty = existing?.quantity ?? 0;

    const record = existing
      ? await tx.mealRecord.update({
          where: { id: existing.id },
          data: {
            quantity,
            source,
            overrideScope,
            isCustomized: true,
          },
        })
      : await tx.mealRecord.create({
          data: {
            userId: targetUserId,
            date,
            quantity,
            unitPricePoisha: resolvedPrice,
            source,
            overrideScope,
            isCustomized: true,
            isFinalized: false,
          },
        });

    await tx.mealRuleHistory.create({
      data: {
        userId: targetUserId,
        effectiveFrom: date,
        quantity,
        scope: overrideScope,
        source,
        changedById: actorId,
        reason: reason ?? null,
      },
    });

    const { year, month } = parseDateStr(date);

    let updatedFollowingCount = 0;
    if (scope === "FOLLOWING_DATES") {
      // Apply to all existing future working-day records from this date onward
      // (skipping non-working days and locked dates for guests; existing invoices remain protected via affectedInvoice)
      const futureRecords = await tx.mealRecord.findMany({
        where: {
          userId: targetUserId,
          date: { gt: date },
        },
      });

      const existingFutureDates = new Set(futureRecords.map((f) => f.date));
      const monthDates = getMonthDateRange(year, month);
      const shouldBackfillPreStart =
        actorRole === UserRole.ADMIN &&
        (!targetUser.mealStartDate || date < targetUser.mealStartDate) &&
        quantity > 0;
      const missingPreStartDates = shouldBackfillPreStart
        ? monthDates.filter(
            (d) =>
              d > date &&
              (!targetUser.mealStartDate || d < targetUser.mealStartDate) &&
              !existingFutureDates.has(d)
          )
        : [];

      if (futureRecords.length > 0 || missingPreStartDates.length > 0) {
        const [futureHolidays, monthPrices] = await Promise.all([
          tx.holiday.findMany({
            where: { date: { gt: date } },
          }),
          missingPreStartDates.length > 0
            ? tx.mealPrice.findMany({
                where: {
                  date: { gte: monthDates[0], lte: monthDates[monthDates.length - 1] },
                },
              })
            : Promise.resolve([]),
        ]);
        const futureHolidayMap = new Map(futureHolidays.map((h) => [h.date, h]));

        const idsToUpdate: string[] = [];
        const staleClosedIds: string[] = [];
        for (const fRec of futureRecords) {
          if (!isWorkingDay(fRec.date, settings, futureHolidayMap)) {
            if (isInvalidClosedDayRecord(fRec)) {
              staleClosedIds.push(fRec.id);
            }
            continue;
          }
          if (
            actorRole !== UserRole.ADMIN &&
            isPastMealDeadline(
              fRec.date,
              settings.deadlineHour,
              settings.deadlineMinute,
              settings.timezone,
              now
            )
          ) {
            continue;
          }
          idsToUpdate.push(fRec.id);
        }

        if (idsToUpdate.length > 0) {
          await tx.mealRecord.updateMany({
            where: { id: { in: idsToUpdate } },
            data: {
              quantity,
              source: MealSource.FOLLOWING_RULE,
              overrideScope: MealOverrideScope.FOLLOWING_DATES,
              isCustomized: false,
            },
          });
          updatedFollowingCount += idsToUpdate.length;
        }

        if (staleClosedIds.length > 0) {
          await resetClosedDayRecordsByIds(staleClosedIds, tx);
        }

        if (missingPreStartDates.length > 0) {
          const monthPriceMap = new Map(monthPrices.map((p) => [p.date, p.pricePoisha]));
          const recordsToCreate = missingPreStartDates
            .filter((d) => isWorkingDay(d, settings, futureHolidayMap))
            .map((d) => ({
              userId: targetUserId,
              date: d,
              quantity,
              unitPricePoisha: resolveMealPrice(d, settings, monthPriceMap),
              source: MealSource.FOLLOWING_RULE,
              overrideScope: MealOverrideScope.FOLLOWING_DATES,
              isCustomized: false,
              isFinalized: false,
            }));

          if (recordsToCreate.length > 0) {
            await tx.mealRecord.createMany({ data: recordsToCreate });
            updatedFollowingCount += recordsToCreate.length;
          }
        }
      }
    }

    // Check if an invoice already exists for this month; do NOT silently mutate it.
    // Instead, compute projected total so admin can explicitly confirm updating the invoice.
    const existingInvoice = await tx.invoice.findUnique({
      where: { userId_year_month: { userId: targetUserId, year, month } },
    });

    let affectedInvoice: {
      invoiceId: string;
      invoiceNumber: string;
      currentTotalPoisha: number;
      projectedTotalPoisha: number;
    } | null = null;

    if (existingInvoice) {
      const monthDates = getMonthDateRange(year, month);
      const monthRecords = await tx.mealRecord.findMany({
        where: {
          userId: targetUserId,
          date: { gte: monthDates[0], lte: monthDates[monthDates.length - 1] },
        },
      });
      const projectedTotalPoisha = monthRecords.reduce(
        (sum, r) => sum + r.quantity * r.unitPricePoisha,
        0
      );
      if (projectedTotalPoisha !== existingInvoice.totalAmountPoisha) {
        affectedInvoice = {
          invoiceId: existingInvoice.id,
          invoiceNumber: existingInvoice.invoiceNumber,
          currentTotalPoisha: existingInvoice.totalAmountPoisha,
          projectedTotalPoisha,
        };
      }
    }

    await logActivity({
      tx,
      actorId,
      targetUserId,
      action:
        actorRole === UserRole.ADMIN && locked
          ? "ADMIN_OVERRIDE_LOCKED_MEAL"
          : actorRole === UserRole.ADMIN
          ? "ADMIN_UPDATE_MEAL"
          : "GUEST_UPDATE_MEAL",
      entityType: "MealRecord",
      entityId: record.id,
      date,
      previousValue: String(previousQty),
      newValue: String(quantity),
      reason:
        scope === "FOLLOWING_DATES"
          ? `[This and following meals]${reason ? ` ${reason}` : ""}`
          : reason ?? null,
    });

    return {
      record,
      previousQuantity: previousQty,
      scope,
      updatedFollowingCount,
      affectedInvoice,
    };
  });

  return updated;
}

export async function submitAdjustmentRequest(params: {
  userId: string;
  date: string;
  requestedQuantity: number;
  reason?: string;
}) {
  const { userId, date, requestedQuantity, reason } = params;

  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 0) {
    throw new MealServiceError("Requested quantity must be a non-negative integer.", 400);
  }

  const [settings, user] = await Promise.all([
    getSettings(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mealStartDate: true },
    }),
  ]);
  if (!user) {
    throw new MealServiceError("User not found.", 404);
  }
  if (user.mealStartDate && date < user.mealStartDate) {
    throw new MealServiceError(
      `Cannot request meal adjustments before your meal start date (${user.mealStartDate}). Only an admin can adjust historical records.`,
      400
    );
  }
  if (settings.maxMealQty != null && requestedQuantity > settings.maxMealQty) {
    throw new MealServiceError(
      `Requested quantity cannot exceed maximum (${settings.maxMealQty}).`,
      400
    );
  }

  const holiday = await prisma.holiday.findUnique({ where: { date } });
  const holidayMap = new Map(holiday ? [[holiday.date, holiday]] : []);
  if (!isWorkingDay(date, settings, holidayMap) && requestedQuantity > 0) {
    throw new MealServiceError("Cannot request meals on a closed holiday or weekend.", 400);
  }

  const mealPriceRecord = await prisma.mealPrice.findUnique({ where: { date } });
  const priceMap = new Map(mealPriceRecord ? [[date, mealPriceRecord.pricePoisha]] : []);
  const resolvedPrice = resolveMealPrice(date, settings, priceMap);

  return prisma.$transaction(async (tx) => {
    let record = await tx.mealRecord.findUnique({
      where: { userId_date: { userId, date } },
    });

    if (!record) {
      record = await tx.mealRecord.create({
        data: {
          userId,
          date,
          quantity: 0,
          unitPricePoisha: resolvedPrice,
          isCustomized: false,
          isFinalized: false,
        },
      });
    }

    const existingPending = await tx.mealAdjustmentRequest.findFirst({
      where: { userId, date, status: AdjustmentStatus.PENDING },
    });
    if (existingPending) {
      throw new MealServiceError(
        "You already have a pending adjustment request for this date.",
        409
      );
    }

    const request = await tx.mealAdjustmentRequest.create({
      data: {
        userId,
        mealRecordId: record.id,
        date,
        currentQuantity: record.quantity,
        requestedQuantity,
        reason: reason ?? null,
        status: AdjustmentStatus.PENDING,
      },
    });

    await logActivity({
      tx,
      actorId: userId,
      targetUserId: userId,
      action: "SUBMIT_ADJUSTMENT_REQUEST",
      entityType: "MealAdjustmentRequest",
      entityId: request.id,
      date,
      previousValue: String(record.quantity),
      newValue: String(requestedQuantity),
      reason: reason ?? null,
    });

    return request;
  });
}

export async function reviewAdjustmentRequest(params: {
  requestId: string;
  reviewerId: string;
  decision: "APPROVED" | "REJECTED";
  reviewNote?: string;
}) {
  const { requestId, reviewerId, decision, reviewNote } = params;

  return prisma.$transaction(async (tx) => {
    const req = await tx.mealAdjustmentRequest.findUnique({
      where: { id: requestId },
      include: { mealRecord: true },
    });

    if (!req) {
      throw new MealServiceError("Adjustment request not found.", 404);
    }
    if (req.status !== AdjustmentStatus.PENDING) {
      throw new MealServiceError("This adjustment request has already been reviewed.", 409);
    }

    const updatedReq = await tx.mealAdjustmentRequest.update({
      where: { id: requestId },
      data: {
        status: decision === "APPROVED" ? AdjustmentStatus.APPROVED : AdjustmentStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: reviewNote ?? null,
      },
    });

    if (decision === "APPROVED") {
      const previousQty = req.mealRecord.quantity;
      const updatedRecord = await tx.mealRecord.update({
        where: { id: req.mealRecordId },
        data: {
          quantity: req.requestedQuantity,
          source: MealSource.ADJUSTMENT_REQUEST,
          overrideScope: MealOverrideScope.SINGLE_DATE,
          isCustomized: true,
        },
      });

      await tx.mealRuleHistory.create({
        data: {
          userId: req.userId,
          effectiveFrom: req.date,
          quantity: req.requestedQuantity,
          scope: MealOverrideScope.SINGLE_DATE,
          source: MealSource.ADJUSTMENT_REQUEST,
          changedById: reviewerId,
          reason: reviewNote ?? req.reason ?? null,
        },
      });

      const { year, month } = parseDateStr(req.date);
      const invoice = await tx.invoice.findUnique({
        where: { userId_year_month: { userId: req.userId, year, month } },
      });

      if (invoice) {
        const itemTotal = updatedRecord.quantity * updatedRecord.unitPricePoisha;
        const existingItem = await tx.invoiceItem.findUnique({
          where: { mealRecordId: updatedRecord.id },
        });
        if (existingItem) {
          await tx.invoiceItem.update({
            where: { id: existingItem.id },
            data: {
              quantity: updatedRecord.quantity,
              unitPricePoisha: updatedRecord.unitPricePoisha,
              totalAmountPoisha: itemTotal,
              isPaid: existingItem.paidAmountPoisha >= itemTotal,
            },
          });
        } else if (updatedRecord.quantity > 0) {
          await tx.invoiceItem.create({
            data: {
              invoiceId: invoice.id,
              mealRecordId: updatedRecord.id,
              date: updatedRecord.date,
              quantity: updatedRecord.quantity,
              unitPricePoisha: updatedRecord.unitPricePoisha,
              totalAmountPoisha: itemTotal,
            },
          });
        }
        await recalculateInvoice(invoice.id, tx);
      }

      await logActivity({
        tx,
        actorId: reviewerId,
        targetUserId: req.userId,
        action: "APPROVE_ADJUSTMENT_REQUEST",
        entityType: "MealAdjustmentRequest",
        entityId: requestId,
        date: req.date,
        previousValue: String(previousQty),
        newValue: String(req.requestedQuantity),
        reason: reviewNote ?? req.reason ?? null,
      });
    } else {
      await logActivity({
        tx,
        actorId: reviewerId,
        targetUserId: req.userId,
        action: "REJECT_ADJUSTMENT_REQUEST",
        entityType: "MealAdjustmentRequest",
        entityId: requestId,
        date: req.date,
        previousValue: String(req.currentQuantity),
        newValue: String(req.requestedQuantity),
        reason: reviewNote ?? null,
      });
    }

    return updatedReq;
  });
}
