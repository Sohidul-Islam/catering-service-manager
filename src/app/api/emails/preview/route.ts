import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/services/auth.service";
import {
  previewInvoiceEmail,
  previewMealAdjustment,
  previewMealConfirmation,
  previewPaymentConfirmationEmail,
} from "@/services/notification.service";
import { handleApiError } from "@/lib/api-utils";
import { EmailType } from "@prisma/client";

const previewSchema = z.discriminatedUnion("emailType", [
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
    const data = previewSchema.parse(body);
    const origin = new URL(req.url).origin;

    if (data.emailType === EmailType.MEAL_CONFIRMATION) {
      const previews = await Promise.all(
        data.guestIds.map((guestId) =>
          previewMealConfirmation({ guestId, date: data.date, note: data.note })
        )
      );
      return NextResponse.json({
        preview: previews[0],
        previews,
        recipientCount: previews.length,
      });
    }

    if (data.emailType === EmailType.MEAL_ADJUSTMENT) {
      const preview = await previewMealAdjustment(data);
      return NextResponse.json({ preview, recipientCount: 1 });
    }

    if (data.emailType === EmailType.INVOICE) {
      const preview = await previewInvoiceEmail({
        invoiceId: data.invoiceId,
        actorId: admin.id,
        origin,
        ensurePublicToken: true,
      });
      return NextResponse.json({ preview, recipientCount: 1 });
    }

    const preview = await previewPaymentConfirmationEmail(data.paymentId);
    return NextResponse.json({ preview, recipientCount: 1 });
  } catch (error) {
    return handleApiError(error);
  }
}
