import { prisma } from "@/lib/prisma";
import { sendAndLogEmail } from "@/lib/email/email-service";
import { renderMealConfirmationEmail } from "@/lib/email/templates/meal-confirmation";
import { renderMealAdjustmentEmail } from "@/lib/email/templates/meal-adjustment";
import { renderInvoiceEmail } from "@/lib/email/templates/invoice";
import { renderPaymentConfirmationEmail } from "@/lib/email/templates/payment-confirmation";
import { buildPublicInvoiceUrl, generatePublicInvoiceToken, getActivePublicToken } from "./public-invoice.service";
import { EmailType } from "@prisma/client";

export class NotificationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface EmailPreviewPayload {
  emailType: EmailType;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  text: string;
  html: string;
  meta?: Record<string, unknown>;
}

export async function previewMealConfirmation(params: {
  guestId: string;
  date: string;
  note?: string;
}): Promise<EmailPreviewPayload> {
  const record = await prisma.mealRecord.findUnique({
    where: { userId_date: { userId: params.guestId, date: params.date } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!record) {
    throw new NotificationError("Meal record not found for guest and date.", 404);
  }

  const rendered = renderMealConfirmationEmail({
    guestName: record.user.name,
    date: record.date,
    quantity: record.quantity,
    unitPricePoisha: record.unitPricePoisha,
    note: params.note,
  });

  return {
    emailType: EmailType.MEAL_CONFIRMATION,
    recipientEmail: record.user.email,
    recipientName: record.user.name,
    ...rendered,
    meta: {
      guestId: record.userId,
      date: record.date,
      quantity: record.quantity,
      unitPricePoisha: record.unitPricePoisha,
      totalPoisha: record.quantity * record.unitPricePoisha,
    },
  };
}

export async function sendMealConfirmationEmails(params: {
  guestIds: string[];
  date: string;
  note?: string;
  sentById: string;
}) {
  const uniqueGuestIds = Array.from(new Set(params.guestIds));
  const results = [];

  for (const guestId of uniqueGuestIds) {
    try {
      const preview = await previewMealConfirmation({
        guestId,
        date: params.date,
        note: params.note,
      });

      const priorSent = await prisma.emailLog.findFirst({
        where: {
          emailType: EmailType.MEAL_CONFIRMATION,
          guestId,
          mealDate: params.date,
          status: "SENT",
        },
      });

      const res = await sendAndLogEmail({
        emailType: EmailType.MEAL_CONFIRMATION,
        recipientEmail: preview.recipientEmail,
        subject: preview.subject,
        html: preview.html,
        text: preview.text,
        guestId,
        mealDate: params.date,
        sentById: params.sentById,
        isResend: Boolean(priorSent),
      });

      results.push({
        guestId,
        recipientEmail: preview.recipientEmail,
        success: res.success,
        emailLogId: res.emailLog.id,
        error: res.success ? null : res.error,
      });
    } catch (err) {
      results.push({
        guestId,
        recipientEmail: null,
        success: false,
        emailLogId: null,
        error: err instanceof Error ? err.message : "Failed to prepare confirmation email",
      });
    }
  }

  return results;
}

export async function previewMealAdjustment(params: {
  guestId: string;
  date: string;
  previousQuantity: number;
  newQuantity: number;
  previousUnitPricePoisha?: number;
  note?: string;
}): Promise<EmailPreviewPayload> {
  const record = await prisma.mealRecord.findUnique({
    where: { userId_date: { userId: params.guestId, date: params.date } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!record) {
    throw new NotificationError("Meal record not found.", 404);
  }

  const rendered = renderMealAdjustmentEmail({
    guestName: record.user.name,
    date: record.date,
    previousQuantity: params.previousQuantity,
    newQuantity: params.newQuantity,
    previousUnitPricePoisha: params.previousUnitPricePoisha,
    newUnitPricePoisha: record.unitPricePoisha,
    note: params.note,
  });

  return {
    emailType: EmailType.MEAL_ADJUSTMENT,
    recipientEmail: record.user.email,
    recipientName: record.user.name,
    ...rendered,
  };
}

export async function sendMealAdjustmentEmail(params: {
  guestId: string;
  date: string;
  previousQuantity: number;
  newQuantity: number;
  previousUnitPricePoisha?: number;
  note?: string;
  sentById: string;
}) {
  const preview = await previewMealAdjustment(params);
  return sendAndLogEmail({
    emailType: EmailType.MEAL_ADJUSTMENT,
    recipientEmail: preview.recipientEmail,
    subject: preview.subject,
    html: preview.html,
    text: preview.text,
    guestId: params.guestId,
    mealDate: params.date,
    sentById: params.sentById,
  });
}

export async function previewInvoiceEmail(params: {
  invoiceId: string;
  actorId?: string;
  origin?: string;
  ensurePublicToken?: boolean;
}): Promise<EmailPreviewPayload & { publicUrl: string | null }> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!invoice) {
    throw new NotificationError("Invoice not found.", 404);
  }

  let tokenRecord = await getActivePublicToken(invoice.id);
  if (!tokenRecord && params.ensurePublicToken && params.actorId) {
    tokenRecord = await generatePublicInvoiceToken(invoice.id, params.actorId);
  }

  const publicUrl = tokenRecord
    ? buildPublicInvoiceUrl(tokenRecord.token, params.origin)
    : null;

  const billingPeriod = new Date(invoice.year, invoice.month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const rendered = renderInvoiceEmail({
    guestName: invoice.user.name,
    invoiceNumber: invoice.invoiceNumber,
    billingPeriod,
    totalMeals: invoice.totalMeals,
    totalAmountPoisha: invoice.totalAmountPoisha,
    paidAmountPoisha: invoice.paidAmountPoisha,
    status: invoice.status,
    publicUrl,
  });

  return {
    emailType: EmailType.INVOICE,
    recipientEmail: invoice.user.email,
    recipientName: invoice.user.name,
    publicUrl,
    ...rendered,
    meta: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      billingPeriod,
      totalAmountPoisha: invoice.totalAmountPoisha,
      paidAmountPoisha: invoice.paidAmountPoisha,
      duePoisha: Math.max(0, invoice.totalAmountPoisha - invoice.paidAmountPoisha),
    },
  };
}

export async function sendInvoiceEmail(params: {
  invoiceId: string;
  sentById: string;
  origin?: string;
}) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    select: { id: true, userId: true },
  });
  if (!invoice) {
    throw new NotificationError("Invoice not found.", 404);
  }

  const preview = await previewInvoiceEmail({
    invoiceId: params.invoiceId,
    actorId: params.sentById,
    origin: params.origin,
    ensurePublicToken: true,
  });

  const priorSent = await prisma.emailLog.findFirst({
    where: {
      emailType: EmailType.INVOICE,
      invoiceId: invoice.id,
      status: "SENT",
    },
  });

  return sendAndLogEmail({
    emailType: EmailType.INVOICE,
    recipientEmail: preview.recipientEmail,
    subject: preview.subject,
    html: preview.html,
    text: preview.text,
    guestId: invoice.userId,
    invoiceId: invoice.id,
    sentById: params.sentById,
    isResend: Boolean(priorSent),
  });
}

export async function previewPaymentConfirmationEmail(paymentId: string): Promise<EmailPreviewPayload> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      invoice: true,
      allocations: {
        include: { invoiceItem: { select: { date: true } } },
      },
    },
  });

  if (!payment) {
    throw new NotificationError("Payment not found.", 404);
  }

  const remainingBalancePoisha = Math.max(
    0,
    payment.invoice.totalAmountPoisha - payment.invoice.paidAmountPoisha
  );
  const allocatedDates = payment.allocations
    .map((a) => a.invoiceItem?.date)
    .filter((d): d is string => Boolean(d));

  const rendered = renderPaymentConfirmationEmail({
    guestName: payment.user.name,
    invoiceNumber: payment.invoice.invoiceNumber,
    amountPoisha: payment.amountPoisha,
    paidAt: payment.paidAt,
    method: payment.method,
    remainingBalancePoisha,
    allocatedDates,
  });

  return {
    emailType: EmailType.PAYMENT_CONFIRMATION,
    recipientEmail: payment.user.email,
    recipientName: payment.user.name,
    ...rendered,
  };
}

export async function sendPaymentConfirmationEmail(params: {
  paymentId: string;
  sentById: string;
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: params.paymentId },
    select: { id: true, userId: true, invoiceId: true },
  });
  if (!payment) {
    throw new NotificationError("Payment not found.", 404);
  }

  const preview = await previewPaymentConfirmationEmail(params.paymentId);
  const priorSent = await prisma.emailLog.findFirst({
    where: {
      emailType: EmailType.PAYMENT_CONFIRMATION,
      paymentId: payment.id,
      status: "SENT",
    },
  });

  return sendAndLogEmail({
    emailType: EmailType.PAYMENT_CONFIRMATION,
    recipientEmail: preview.recipientEmail,
    subject: preview.subject,
    html: preview.html,
    text: preview.text,
    guestId: payment.userId,
    invoiceId: payment.invoiceId,
    paymentId: payment.id,
    sentById: params.sentById,
    isResend: Boolean(priorSent),
  });
}
