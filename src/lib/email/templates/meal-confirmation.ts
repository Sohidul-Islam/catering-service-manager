import { formatBDT } from "@/lib/money";
import { formatReadableDate } from "@/lib/timezone";

export interface EmailTemplateOutput {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function wrapEmailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#2563eb;color:#ffffff;padding:18px 24px;">
      <p style="margin:0;font-size:12px;opacity:0.9;text-transform:uppercase;letter-spacing:0.05em;">Office Meal Management</p>
      <h1 style="margin:4px 0 0;font-size:18px;font-weight:600;">${escapeHtml(title)}</h1>
    </div>
    <div style="padding:24px;font-size:14px;line-height:1.6;color:#334155;">
      ${bodyHtml}
    </div>
    <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
      Sent by Office Meal Management System
    </div>
  </div>
</body>
</html>`;
}

export interface MealConfirmationEmailParams {
  guestName: string;
  date: string;
  quantity: number;
  unitPricePoisha: number;
  note?: string | null;
}

export function renderMealConfirmationEmail(
  params: MealConfirmationEmailParams
): EmailTemplateOutput {
  const { guestName, date, quantity, unitPricePoisha, note } = params;
  const readableDate = formatReadableDate(date);
  const totalPoisha = quantity * unitPricePoisha;
  const unitPrice = formatBDT(unitPricePoisha);
  const total = formatBDT(totalPoisha);
  const mealLabel = quantity === 1 ? "1 meal" : `${quantity} meals`;
  const statusLabel = quantity > 0 ? "Confirmed" : "OFF (0 meals)";

  const subject = `Meal Confirmation - ${readableDate}`;
  const text = [
    `Meal Confirmation`,
    ``,
    `Hello ${guestName},`,
    ``,
    `Your lunch for ${readableDate} has been confirmed.`,
    ``,
    `Meals: ${mealLabel}`,
    `Price per meal: ${unitPrice}`,
    `Total: ${total}`,
    `Meal Status: ${statusLabel}`,
    note ? `Note: ${note}` : "",
    ``,
    `Thank you.`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = wrapEmailLayout(
    "Meal Confirmation",
    `<p>Hello <strong>${escapeHtml(guestName)}</strong>,</p>
     <p>Your lunch for <strong>${escapeHtml(readableDate)}</strong> has been confirmed.</p>
     <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:8px;">
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Meals</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${escapeHtml(mealLabel)}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Price per meal</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(unitPrice)}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Total</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f172a;">${escapeHtml(total)}</td></tr>
       <tr><td style="padding:8px 12px;">Meal Status</td><td style="padding:8px 12px;text-align:right;font-weight:600;color:#059669;">${escapeHtml(statusLabel)}</td></tr>
     </table>
     ${note ? `<p style="background:#eff6ff;padding:10px 12px;border-radius:6px;font-size:13px;"><strong>Note:</strong> ${escapeHtml(note)}</p>` : ""}
     <p style="margin-top:16px;">Thank you.</p>`
  );

  return { subject, text, html };
}
