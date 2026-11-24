import { formatBDT } from "@/lib/money";
import { EmailTemplateOutput, escapeHtml, wrapEmailLayout } from "./meal-confirmation";

export interface InvoiceEmailParams {
  guestName: string;
  invoiceNumber: string;
  billingPeriod: string;
  totalMeals: number;
  totalAmountPoisha: number;
  paidAmountPoisha: number;
  status: string;
  publicUrl?: string | null;
}

export function renderInvoiceEmail(params: InvoiceEmailParams): EmailTemplateOutput {
  const {
    guestName,
    invoiceNumber,
    billingPeriod,
    totalMeals,
    totalAmountPoisha,
    paidAmountPoisha,
    status,
    publicUrl,
  } = params;

  const duePoisha = Math.max(0, totalAmountPoisha - paidAmountPoisha);
  const totalStr = formatBDT(totalAmountPoisha);
  const paidStr = formatBDT(paidAmountPoisha);
  const dueStr = formatBDT(duePoisha);
  const statusLabel = status.replace("_", " ");

  const subject = `Invoice ${invoiceNumber} - ${billingPeriod}`;
  const text = [
    `Hello ${guestName},`,
    ``,
    `Here is your monthly lunch invoice for ${billingPeriod}.`,
    ``,
    `Invoice Number: ${invoiceNumber}`,
    `Total Meals: ${totalMeals}`,
    `Total Amount: ${totalStr}`,
    `Total Paid: ${paidStr}`,
    `Outstanding Due: ${dueStr}`,
    `Payment Status: ${statusLabel}`,
    publicUrl ? `\nView Full Invoice & Payment History:\n${publicUrl}` : "",
    ``,
    `Thank you.`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = wrapEmailLayout(
    `Invoice ${invoiceNumber}`,
    `<p>Hello <strong>${escapeHtml(guestName)}</strong>,</p>
     <p>Here is your monthly lunch invoice summary for <strong>${escapeHtml(billingPeriod)}</strong>.</p>
     <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:8px;">
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Invoice Number</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${escapeHtml(invoiceNumber)}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Billing Period</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(billingPeriod)}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Total Meals</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${totalMeals}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Total Amount</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${escapeHtml(totalStr)}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Total Paid</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#059669;">${escapeHtml(paidStr)}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Outstanding Due</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#dc2626;">${escapeHtml(dueStr)}</td></tr>
       <tr><td style="padding:8px 12px;">Status</td><td style="padding:8px 12px;text-align:right;font-weight:600;">${escapeHtml(statusLabel)}</td></tr>
     </table>
     ${
       publicUrl
         ? `<div style="margin:20px 0;text-align:center;">
              <a href="${escapeHtml(publicUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">View Public Invoice</a>
              <p style="margin:8px 0 0;font-size:12px;color:#64748b;word-break:break-all;">${escapeHtml(publicUrl)}</p>
            </div>`
         : ""
     }
     <p>Thank you.</p>`
  );

  return { subject, text, html };
}
