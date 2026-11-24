import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { logActivity } from "./activity.service";

export function buildPublicInvoiceUrl(token: string, origin?: string): string {
  const base = (origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(
    /\/$/,
    ""
  );
  return `${base}/invoice/${token}`;
}

export async function getActivePublicToken(invoiceId: string) {
  return prisma.publicInvoiceToken.findFirst({
    where: { invoiceId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function generatePublicInvoiceToken(invoiceId: string, actorId: string) {
  const existing = await getActivePublicToken(invoiceId);
  if (existing) {
    return existing;
  }

  const token = crypto.randomBytes(24).toString("hex");
  const created = await prisma.publicInvoiceToken.create({
    data: {
      invoiceId,
      token,
      createdById: actorId,
    },
  });

  await logActivity({
    actorId,
    action: "GENERATE_PUBLIC_INVOICE_LINK",
    entityType: "PublicInvoiceToken",
    entityId: created.id,
    newValue: JSON.stringify({ invoiceId }),
  });

  return created;
}

export async function revokePublicInvoiceToken(invoiceId: string, actorId: string) {
  const now = new Date();
  const res = await prisma.publicInvoiceToken.updateMany({
    where: { invoiceId, revokedAt: null },
    data: { revokedAt: now },
  });

  if (res.count > 0) {
    await logActivity({
      actorId,
      action: "REVOKE_PUBLIC_INVOICE_LINK",
      entityType: "Invoice",
      entityId: invoiceId,
    });
  }

  return res.count;
}

export async function regeneratePublicInvoiceToken(invoiceId: string, actorId: string) {
  const token = crypto.randomBytes(24).toString("hex");
  const created = await prisma.$transaction(async (tx) => {
    await tx.publicInvoiceToken.updateMany({
      where: { invoiceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const newToken = await tx.publicInvoiceToken.create({
      data: {
        invoiceId,
        token,
        createdById: actorId,
      },
    });

    await logActivity({
      tx,
      actorId,
      action: "REGENERATE_PUBLIC_INVOICE_LINK",
      entityType: "PublicInvoiceToken",
      entityId: newToken.id,
      newValue: JSON.stringify({ invoiceId }),
    });

    return newToken;
  });

  return created;
}

/**
 * Returns sanitized public invoice data without exposing any internal database IDs,
 * passwords, auth tokens, or admin metadata.
 */
export async function getPublicInvoiceByToken(token: string) {
  const record = await prisma.publicInvoiceToken.findUnique({
    where: { token },
    include: {
      invoice: {
        include: {
          user: {
            select: { name: true, email: true, mealStartDate: true },
          },
          items: {
            orderBy: { date: "asc" },
          },
          payments: {
            orderBy: { paidAt: "asc" },
            include: {
              allocations: {
                include: {
                  invoiceItem: {
                    select: { date: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!record || record.revokedAt) {
    return null;
  }

  const inv = record.invoice;
  const outstandingPoisha = Math.max(0, inv.totalAmountPoisha - inv.paidAmountPoisha);
  const allItemDates = inv.items.map((i) => i.date);
  const participationStart = allItemDates[0] ?? inv.user.mealStartDate ?? null;
  const participationEnd = allItemDates[allItemDates.length - 1] ?? null;

  return {
    invoiceNumber: inv.invoiceNumber,
    year: inv.year,
    month: inv.month,
    status: inv.status,
    totalMeals: inv.totalMeals,
    totalAmountPoisha: inv.totalAmountPoisha,
    paidAmountPoisha: inv.paidAmountPoisha,
    outstandingPoisha,
    participationStart,
    participationEnd,
    generatedAt: inv.generatedAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
    guest: {
      name: inv.user.name,
      email: inv.user.email,
    },
    items: inv.items
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        date: item.date,
        quantity: item.quantity,
        unitPricePoisha: item.unitPricePoisha,
        totalAmountPoisha: item.totalAmountPoisha,
        paidAmountPoisha: item.paidAmountPoisha,
        isPaid: item.isPaid,
      })),
    payments: inv.payments.map((p) => ({
      paidAt: p.paidAt.toISOString(),
      amountPoisha: p.amountPoisha,
      method: p.method,
      paymentType: p.paymentType,
      reference: p.reference,
      allocatedDates: p.allocations
        .map((a) => a.invoiceItem?.date)
        .filter((d): d is string => Boolean(d)),
    })),
  };
}
