import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/services/auth.service";
import {
  sendInvoiceEmail,
  sendMealAdjustmentEmail,
  sendMealConfirmationEmails,
  sendPaymentConfirmationEmail,
} from "@/services/notification.service";
import { handleApiError } from "@/lib/api-utils";
import { EmailType } from "@prisma/client";

const sendSchema = z.discriminatedUnion("emailType", [
  z.object({
    emailType: z.literal(EmailType.MEAL_CONFIRMATION),
    guestIds: z.array(z.string().min(1)).min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().max(300).optional(),
  }),
  z.object({
    emailType: z.literal(EmailType.MEAL_ADJUSTMENT),
    guestId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    previousQuantity: z.number().int().min(0),
    newQuantity: z.number().int().min(0),
    previousUnitPricePoisha: z.number().int().min(0).optional(),
    note: z.string().max(300).optional(),
  }),
  z.object({
    emailType: z.literal(EmailType.INVOICE),
    invoiceId: z.string().min(1),
  }),
  z.object({
    emailType: z.literal(EmailType.PAYMENT_CONFIRMATION),
    paymentId: z.string().min(1),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const data = sendSchema.parse(body);
    const origin = new URL(req.url).origin;

    if (data.emailType === EmailType.MEAL_CONFIRMATION) {
      const results = await sendMealConfirmationEmails({
        guestIds: data.guestIds,
        date: data.date,
        note: data.note,
        sentById: admin.id,
      });
      const sentCount = results.filter((r) => r.success).length;
      const failedCount = results.length - sentCount;
      return NextResponse.json({ results, sentCount, failedCount });
    }

    if (data.emailType === EmailType.MEAL_ADJUSTMENT) {
      const res = await sendMealAdjustmentEmail({
        ...data,
        sentById: admin.id,
      });
      return NextResponse.json(res, { status: res.success ? 200 : 502 });
    }

    if (data.emailType === EmailType.INVOICE) {
      const res = await sendInvoiceEmail({
        invoiceId: data.invoiceId,
        sentById: admin.id,
        origin,
      });
      return NextResponse.json(res, { status: res.success ? 200 : 502 });
    }

    const res = await sendPaymentConfirmationEmail({
      paymentId: data.paymentId,
      sentById: admin.id,
    });
    return NextResponse.json(res, { status: res.success ? 200 : 502 });
  } catch (error) {
    return handleApiError(error);
  }
}
