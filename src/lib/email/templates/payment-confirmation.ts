import { formatBDT } from "@/lib/money";
import { EmailTemplateOutput, escapeHtml, wrapEmailLayout } from "./meal-confirmation";

export interface PaymentConfirmationEmailParams {
  guestName: string;
  invoiceNumber: string;
  amountPoisha: number;
  paidAt: Date;
  method: string;
  remainingBalancePoisha: number;
  allocatedDates?: string[];
}

export function renderPaymentConfirmationEmail(
  params: PaymentConfirmationEmailParams
): EmailTemplateOutput {
  const {
    guestName,
    invoiceNumber,
    amountPoisha,
    paidAt,
    method,
    remainingBalancePoisha,
    allocatedDates = [],
  } = params;

  const amountStr = formatBDT(amountPoisha);
  const remainingStr = formatBDT(remainingBalancePoisha);
  const dateStr = paidAt.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  const methodLabel = method.replace("_", " ");

  const subject = `Payment Confirmation - ${invoiceNumber}`;
  const text = [
    `Hello ${guestName},`,
    ``,
    `We have received your lunch invoice payment.`,
    ``,
    `Invoice Number: ${invoiceNumber}`,
    `Payment Amount: ${amountStr}`,
    `Payment Date: ${dateStr}`,
    `Payment Method: ${methodLabel}`,
    `Remaining Balance: ${remainingStr}`,
    allocatedDates.length > 0 ? `Allocated Dates: ${allocatedDates.join(", ")}` : "",
    ``,
    `Thank you.`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = wrapEmailLayout(
    "Payment Confirmation",
    `<p>Hello <strong>${escapeHtml(guestName)}</strong>,</p>
     <p>We have received your payment for invoice <strong>${escapeHtml(invoiceNumber)}</strong>.</p>
     <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:8px;">
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Payment Amount</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#059669;">${escapeHtml(amountStr)}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Payment Date</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(dateStr)}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Payment Method</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(methodLabel)}</td></tr>
       <tr><td style="padding:8px 12px;">Remaining Balance</td><td style="padding:8px 12px;text-align:right;font-weight:600;">${escapeHtml(remainingStr)}</td></tr>
     </table>
     ${
       allocatedDates.length > 0
         ? `<p style="font-size:13px;"><strong>Allocated Meal Dates:</strong> ${escapeHtml(allocatedDates.join(", "))}</p>`
         : ""
     }
     <p>Thank you.</p>`
  );

  return { subject, text, html };
}
