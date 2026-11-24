import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/activity.service";
import { EmailStatus, EmailType } from "@prisma/client";
import { getFromAddress, getResendClient } from "./resend";

export interface SendLoggedEmailParams {
  emailType: EmailType;
  recipientEmail: string;
  subject: string;
  html: string;
  text: string;
  guestId?: string | null;
  mealDate?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  sentById: string;
  isResend?: boolean;
}

export async function sendAndLogEmail(params: SendLoggedEmailParams) {
  const {
    emailType,
    recipientEmail,
    subject,
    html,
    text,
    guestId,
    mealDate,
    invoiceId,
    paymentId,
    sentById,
    isResend,
  } = params;

  const logEntry = await prisma.emailLog.create({
    data: {
      emailType,
      recipientEmail,
      subject,
      guestId: guestId ?? null,
      mealDate: mealDate ?? null,
      invoiceId: invoiceId ?? null,
      paymentId: paymentId ?? null,
      sentById,
      status: EmailStatus.PENDING,
    },
  });

  const resend = getResendClient();
  if (!resend) {
    const errMsg = "RESEND_API_KEY is not configured in server environment.";
    const failed = await prisma.emailLog.update({
      where: { id: logEntry.id },
      data: {
        status: EmailStatus.FAILED,
        errorMessage: errMsg,
      },
    });
    await logActivity({
      actorId: sentById,
      targetUserId: guestId ?? null,
      action: `EMAIL_FAILED_${emailType}`,
      entityType: "EmailLog",
      entityId: failed.id,
      date: mealDate ?? null,
      newValue: JSON.stringify({ recipientEmail, error: errMsg }),
    });
    return { success: false as const, emailLog: failed, error: errMsg };
  }

  try {
    const response = await resend.emails.send({
      from: getFromAddress(),
      to: recipientEmail,
      subject,
      html,
      text,
    });

    if (response.error) {
      const errMsg = response.error.message || "Resend API rejected the email";
      const failed = await prisma.emailLog.update({
        where: { id: logEntry.id },
        data: {
          status: EmailStatus.FAILED,
          errorMessage: errMsg,
        },
      });
      await logActivity({
        actorId: sentById,
        targetUserId: guestId ?? null,
        action: `EMAIL_FAILED_${emailType}`,
        entityType: "EmailLog",
        entityId: failed.id,
        date: mealDate ?? null,
        newValue: JSON.stringify({ recipientEmail, error: errMsg }),
      });
      return { success: false as const, emailLog: failed, error: errMsg };
    }

    const messageId = response.data?.id ?? null;
    const sentAt = new Date();
    const updated = await prisma.emailLog.update({
      where: { id: logEntry.id },
      data: {
        status: EmailStatus.SENT,
        resendMessageId: messageId,
        sentAt,
      },
    });

    await logActivity({
      actorId: sentById,
      targetUserId: guestId ?? null,
      action: isResend ? `EMAIL_RESENT_${emailType}` : `EMAIL_SENT_${emailType}`,
      entityType: "EmailLog",
      entityId: updated.id,
      date: mealDate ?? null,
      newValue: JSON.stringify({
        recipientEmail,
        resendMessageId: messageId,
        invoiceId: invoiceId ?? undefined,
      }),
    });

    return { success: true as const, emailLog: updated };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown email delivery error";
    const failed = await prisma.emailLog.update({
      where: { id: logEntry.id },
      data: {
        status: EmailStatus.FAILED,
        errorMessage: errMsg,
      },
    });
    await logActivity({
      actorId: sentById,
      targetUserId: guestId ?? null,
      action: `EMAIL_FAILED_${emailType}`,
      entityType: "EmailLog",
      entityId: failed.id,
      date: mealDate ?? null,
      newValue: JSON.stringify({ recipientEmail, error: errMsg }),
    });
    return { success: false as const, emailLog: failed, error: errMsg };
  }
}
