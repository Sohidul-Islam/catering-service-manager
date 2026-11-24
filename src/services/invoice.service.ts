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

  const guests = await prisma.user.findMany({
    where: {
      role: UserRole.GUEST,
      mealRecords: {
        some: {
          date: { gte: startDate, lte: endDate },
        },
      },
    },
    select: { id: true, name: true },
  });

  const generatedInvoices = [];

  for (const guest of guests) {
    const inv = await prisma.$transaction(async (tx) => {
      const records = await tx.mealRecord.findMany({
        where: {
          userId: guest.id,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: "asc" },
      });

      let invoice = await tx.invoice.findUnique({
        where: { userId_year_month: { userId: guest.id, year, month } },
        include: { items: true, payments: true },
      });

      if (!invoice) {
        invoice = await tx.invoice.create({
          data: {
            invoiceNumber: buildInvoiceNumber(year, month, guest.id),
            userId: guest.id,
            year,
            month,
          },
          include: { items: true, payments: true },
        });
      }

      const existingItemsByRecord = new Map(
        invoice.items.map((item) => [item.mealRecordId, item])
      );

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
        targetUserId: guest.id,
        action: "GENERATE_INVOICE",
        entityType: "Invoice",
        entityId: invoice.id,
        newValue: JSON.stringify({
          invoiceNumber: invoice.invoiceNumber,
          year,
          month,
          totalMeals: updated?.totalMeals ?? 0,
          totalAmountPoisha: updated?.totalAmountPoisha ?? 0,
        }),
      });

      return updated;
    });

    if (inv) generatedInvoices.push(inv);
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
