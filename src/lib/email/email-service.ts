import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/activity.service";
import { EmailStatus, EmailType } from "@prisma/client";
import { getFromAddress, getTransporter } from "./mailer";

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
  sentById?: string | null;
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
      sentById: sentById ?? null,
      status: EmailStatus.PENDING,
    },
  });

  const transporter = getTransporter();

  if (!transporter) {
    const errMsg =
      "Nodemailer SMTP is not configured. Please set SMTP_USER and SMTP_PASS in .env.";
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
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: recipientEmail,
      subject,
      html,
      text,
    });

    const messageId = info.messageId || `smtp-${Date.now()}`;
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
        messageId,
        invoiceId: invoiceId ?? undefined,
      }),
    });

    return { success: true as const, emailLog: updated };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Email delivery error";
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
