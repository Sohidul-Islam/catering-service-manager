import { prisma } from "@/lib/prisma";
import { PaymentMethod, PaymentType } from "@prisma/client";
import { logActivity } from "./activity.service";
import { computeInvoiceStatus } from "./invoice.service";

export class PaymentServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface RecordPaymentInput {
  invoiceId: string;
  recordedById: string;
  paymentType: PaymentType;
  method: PaymentMethod;
  amountPoisha?: number;
  invoiceItemIds?: string[];
  reference?: string;
  note?: string;
  paidAt?: Date;
}

export async function recordPayment(input: RecordPaymentInput) {
  const {
    invoiceId,
    recordedById,
    paymentType,
    method,
    reference,
    note,
    paidAt,
  } = input;

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: { orderBy: { date: "asc" } },
      },
    });

    if (!invoice) {
      throw new PaymentServiceError("Invoice not found.", 404);
    }

    const outstandingPoisha = invoice.totalAmountPoisha - invoice.paidAmountPoisha;
    if (outstandingPoisha <= 0) {
      throw new PaymentServiceError("This invoice is already fully paid.", 409);
    }

    let finalAmountPoisha = 0;
    const itemAllocations: { invoiceItemId: string; amountPoisha: number; newPaid: number; itemTotal: number }[] = [];

    if (paymentType === PaymentType.FULL) {
      finalAmountPoisha = outstandingPoisha;
      // Allocate across unpaid items up to outstanding
      let remaining = finalAmountPoisha;
      for (const item of invoice.items) {
        if (remaining <= 0) break;
        const itemRemaining = item.totalAmountPoisha - item.paidAmountPoisha;
        if (itemRemaining > 0) {
          const alloc = Math.min(itemRemaining, remaining);
          itemAllocations.push({
            invoiceItemId: item.id,
            amountPoisha: alloc,
            newPaid: item.paidAmountPoisha + alloc,
            itemTotal: item.totalAmountPoisha,
          });
          remaining -= alloc;
        }
      }
    } else if (paymentType === PaymentType.SELECTED_DATES) {
      const selectedIds = Array.from(new Set(input.invoiceItemIds ?? []));
      if (selectedIds.length === 0) {
        throw new PaymentServiceError("Select at least one meal date to pay.", 400);
      }

      const itemMap = new Map(invoice.items.map((i) => [i.id, i]));
      for (const itemId of selectedIds) {
        const item = itemMap.get(itemId);
        if (!item) {
          throw new PaymentServiceError("Selected date item does not belong to this invoice.", 400);
        }
        const itemRemaining = item.totalAmountPoisha - item.paidAmountPoisha;
        if (itemRemaining <= 0) {
          throw new PaymentServiceError(
            `Date ${item.date} is already fully paid (duplicate allocation prevented).`,
            409
          );
        }
        finalAmountPoisha += itemRemaining;
        itemAllocations.push({
          invoiceItemId: item.id,
          amountPoisha: itemRemaining,
          newPaid: item.paidAmountPoisha + itemRemaining,
          itemTotal: item.totalAmountPoisha,
        });
      }

      if (finalAmountPoisha > outstandingPoisha) {
        throw new PaymentServiceError(
          "Selected dates total exceeds the invoice outstanding balance.",
          400
        );
      }
    } else {
      // PARTIAL
      const amt = input.amountPoisha ?? 0;
      if (!Number.isInteger(amt) || amt <= 0) {
        throw new PaymentServiceError("Payment amount must be a positive integer (in poisha).", 400);
      }
      if (amt > outstandingPoisha) {
        throw new PaymentServiceError(
          "Payment amount cannot exceed the remaining outstanding balance.",
          400
        );
      }
      finalAmountPoisha = amt;
    }

    if (finalAmountPoisha <= 0) {
      throw new PaymentServiceError("Calculated payment amount must be greater than zero.", 400);
    }

    const payment = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        userId: invoice.userId,
        amountPoisha: finalAmountPoisha,
        method,
        paymentType,
        reference: reference ?? null,
        note: note ?? null,
        paidAt: paidAt ?? new Date(),
        recordedById,
      },
    });

    if (itemAllocations.length > 0) {
      for (const alloc of itemAllocations) {
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceItemId: alloc.invoiceItemId,
            amountPoisha: alloc.amountPoisha,
          },
        });
        await tx.invoiceItem.update({
          where: { id: alloc.invoiceItemId },
          data: {
            paidAmountPoisha: alloc.newPaid,
            isPaid: alloc.newPaid >= alloc.itemTotal,
          },
        });
      }
    } else {
      // General unallocated partial payment against invoice balance
      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceItemId: null,
          amountPoisha: finalAmountPoisha,
        },
      });
    }

    const newPaidTotal = invoice.paidAmountPoisha + finalAmountPoisha;
    const newStatus = computeInvoiceStatus(invoice.totalAmountPoisha, newPaidTotal);

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paidAmountPoisha: newPaidTotal,
        status: newStatus,
      },
    });

    await logActivity({
      tx,
      actorId: recordedById,
      targetUserId: invoice.userId,
      action: "RECORD_PAYMENT",
      entityType: "Payment",
      entityId: payment.id,
      newValue: JSON.stringify({
        invoiceNumber: invoice.invoiceNumber,
        paymentType,
        method,
        amountPoisha: finalAmountPoisha,
        allocatedItemCount: itemAllocations.length,
        newInvoiceStatus: updatedInvoice.status,
      }),
      reason: note ?? null,
    });

    return { payment, invoice: updatedInvoice };
  });
}
