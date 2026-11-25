import { prisma } from "@/lib/prisma";
import { getMonthDateRange } from "@/lib/timezone";
import { InvoiceStatus, Prisma, UserRole } from "@prisma/client";
import { logActivity } from "./activity.service";

export function computeInvoiceStatus(
  totalAmountPoisha: number,
  paidAmountPoisha: number
): InvoiceStatus {
  if (totalAmountPoisha <= 0) {
    return InvoiceStatus.PAID;
  }
  if (paidAmountPoisha <= 0) {
    return InvoiceStatus.UNPAID;
  }
  if (paidAmountPoisha >= totalAmountPoisha) {
    return InvoiceStatus.PAID;
  }
  return InvoiceStatus.PARTIALLY_PAID;
}

export async function recalculateInvoice(
  invoiceId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, payments: true },
  });
  if (!invoice) return null;

  const totalMeals = invoice.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmountPoisha = invoice.items.reduce((sum, item) => sum + item.totalAmountPoisha, 0);
  const paidAmountPoisha = invoice.payments.reduce((sum, p) => sum + p.amountPoisha, 0);
  const status = computeInvoiceStatus(totalAmountPoisha, paidAmountPoisha);

  return tx.invoice.update({
    where: { id: invoiceId },
    data: {
      totalMeals,
      totalAmountPoisha,
      paidAmountPoisha,
      status,
    },
  });
}

function buildInvoiceNumber(year: number, month: number, userId: string): string {
  const ym = `${year}${String(month).padStart(2, "0")}`;
  const suffix = userId.slice(-6).toUpperCase();
  return `INV-${ym}-${suffix}`;
}

export async function generateMonthlyInvoices(
  year: number,
  month: number,
  actorId: string
) {
  const dates = getMonthDateRange(year, month);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const [guests, allRecords, existingInvoices] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: UserRole.GUEST,
        mealRecords: {
          some: {
            date: { gte: startDate, lte: endDate },
          },
        },
      },
      select: { id: true, name: true },
    }),
    prisma.mealRecord.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        user: { role: UserRole.GUEST },
      },
      orderBy: { date: "asc" },
    }),
    prisma.invoice.findMany({
      where: { year, month },
      include: { items: true, payments: true },
    }),
  ]);

  const recordsByGuest = new Map<string, typeof allRecords>();
  for (const rec of allRecords) {
    const list = recordsByGuest.get(rec.userId) ?? [];
    list.push(rec);
    recordsByGuest.set(rec.userId, list);
  }

  const invoiceByGuest = new Map(existingInvoices.map((inv) => [inv.userId, inv]));
  const unfinalizedIds: string[] = [];
  const generatedInvoices = [];

  for (const guest of guests) {
    const records = recordsByGuest.get(guest.id) ?? [];
    const existingInvoice = invoiceByGuest.get(guest.id);

    const invoice =
      existingInvoice ??
      (await prisma.invoice.create({
        data: {
          invoiceNumber: buildInvoiceNumber(year, month, guest.id),
          userId: guest.id,
          year,
          month,
        },
        include: { items: true, payments: true },
      }));

    const existingItemsByRecord = new Map(
      invoice.items.map((item) => [item.mealRecordId, item])
    );

    const itemsToCreate: Prisma.InvoiceItemCreateManyInput[] = [];
    const itemUpdates: Promise<unknown>[] = [];

    let totalMeals = 0;
    let totalAmountPoisha = 0;

    for (const rec of records) {
      const itemTotal = rec.quantity * rec.unitPricePoisha;
      totalMeals += rec.quantity;
      totalAmountPoisha += itemTotal;

      if (!rec.isFinalized) {
        unfinalizedIds.push(rec.id);
      }

      const existingItem = existingItemsByRecord.get(rec.id);
      if (existingItem) {
        const nextIsPaid = itemTotal === 0 ? true : existingItem.paidAmountPoisha >= itemTotal;
        if (
          existingItem.quantity !== rec.quantity ||
          existingItem.unitPricePoisha !== rec.unitPricePoisha ||
          existingItem.totalAmountPoisha !== itemTotal ||
          existingItem.isPaid !== nextIsPaid
        ) {
          itemUpdates.push(
            prisma.invoiceItem.update({
              where: { id: existingItem.id },
              data: {
                quantity: rec.quantity,
                unitPricePoisha: rec.unitPricePoisha,
                totalAmountPoisha: itemTotal,
                isPaid: nextIsPaid,
              },
            })
          );
        }
      } else {
        itemsToCreate.push({
          invoiceId: invoice.id,
          mealRecordId: rec.id,
          date: rec.date,
          quantity: rec.quantity,
          unitPricePoisha: rec.unitPricePoisha,
          totalAmountPoisha: itemTotal,
          paidAmountPoisha: 0,
          isPaid: itemTotal === 0,
        });
      }
    }

    if (itemsToCreate.length > 0) {
      await prisma.invoiceItem.createMany({ data: itemsToCreate });
    }
    if (itemUpdates.length > 0) {
      await Promise.all(itemUpdates);
    }

    const paidAmountPoisha = invoice.payments.reduce((sum, p) => sum + p.amountPoisha, 0);
    const status = computeInvoiceStatus(totalAmountPoisha, paidAmountPoisha);

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        totalMeals,
        totalAmountPoisha,
        paidAmountPoisha,
        status,
      },
    });

    await logActivity({
      actorId,
      targetUserId: guest.id,
      action: "GENERATE_INVOICE",
      entityType: "Invoice",
      entityId: invoice.id,
      newValue: JSON.stringify({
        invoiceNumber: invoice.invoiceNumber,
        year,
        month,
        totalMeals: updated.totalMeals,
        totalAmountPoisha: updated.totalAmountPoisha,
      }),
    });

    generatedInvoices.push(updated);
  }

  if (unfinalizedIds.length > 0) {
    await prisma.mealRecord.updateMany({
      where: { id: { in: unfinalizedIds } },
      data: { isFinalized: true },
    });
  }

  return generatedInvoices;
}

export async function recalculateInvoiceFromMeals(invoiceId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true },
    });
    if (!invoice) {
      return null;
    }

    const dates = getMonthDateRange(invoice.year, invoice.month);
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const records = await tx.mealRecord.findMany({
      where: {
        userId: invoice.userId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: "asc" },
    });

    const existingItemsByRecord = new Map(
      invoice.items.map((item) => [item.mealRecordId, item])
    );

    const previousTotalPoisha = invoice.totalAmountPoisha;

    for (const rec of records) {
      const itemTotal = rec.quantity * rec.unitPricePoisha;
      const existingItem = existingItemsByRecord.get(rec.id);

      if (existingItem) {
        await tx.invoiceItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: rec.quantity,
            unitPricePoisha: rec.unitPricePoisha,
            totalAmountPoisha: itemTotal,
            isPaid: itemTotal === 0 ? true : existingItem.paidAmountPoisha >= itemTotal,
          },
        });
      } else {
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            mealRecordId: rec.id,
            date: rec.date,
            quantity: rec.quantity,
            unitPricePoisha: rec.unitPricePoisha,
            totalAmountPoisha: itemTotal,
            paidAmountPoisha: 0,
            isPaid: itemTotal === 0,
          },
        });
      }

      if (!rec.isFinalized) {
        await tx.mealRecord.update({
          where: { id: rec.id },
          data: { isFinalized: true },
        });
      }
    }

    const updated = await recalculateInvoice(invoice.id, tx);

    await logActivity({
      tx,
      actorId,
      targetUserId: invoice.userId,
      action: "RECALCULATE_INVOICE",
      entityType: "Invoice",
      entityId: invoice.id,
      previousValue: String(previousTotalPoisha),
      newValue: String(updated?.totalAmountPoisha ?? previousTotalPoisha),
    });

    return updated;
  });
}

export async function deleteInvoice(invoiceId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        _count: {
          select: { payments: true, items: true },
        },
      },
    });
    if (!invoice) {
      return null;
    }

    const monthDates = getMonthDateRange(invoice.year, invoice.month);
    await tx.mealRecord.updateMany({
      where: {
        userId: invoice.userId,
        date: { gte: monthDates[0], lte: monthDates[monthDates.length - 1] },
      },
      data: { isFinalized: false },
    });

    await tx.invoice.delete({
      where: { id: invoiceId },
    });

    await logActivity({
      tx,
      actorId,
      targetUserId: invoice.userId,
      action: "DELETE_INVOICE",
      entityType: "Invoice",
      entityId: invoice.id,
      previousValue: JSON.stringify({
        invoiceNumber: invoice.invoiceNumber,
        year: invoice.year,
        month: invoice.month,
        totalMeals: invoice.totalMeals,
        totalAmountPoisha: invoice.totalAmountPoisha,
        paidAmountPoisha: invoice.paidAmountPoisha,
        deletedPaymentsCount: invoice._count.payments,
      }),
    });

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      year: invoice.year,
      month: invoice.month,
      userId: invoice.userId,
      deletedPaymentsCount: invoice._count.payments,
    };
  });
}
