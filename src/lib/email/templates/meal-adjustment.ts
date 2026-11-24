import { formatBDT } from "@/lib/money";
import { formatReadableDate } from "@/lib/timezone";
import { EmailTemplateOutput, escapeHtml, wrapEmailLayout } from "./meal-confirmation";

export interface MealAdjustmentEmailParams {
  guestName: string;
  date: string;
  previousQuantity: number;
  newQuantity: number;
  previousUnitPricePoisha?: number;
  newUnitPricePoisha: number;
  note?: string | null;
}

export function renderMealAdjustmentEmail(
  params: MealAdjustmentEmailParams
): EmailTemplateOutput {
  const {
    guestName,
    date,
    previousQuantity,
    newQuantity,
    previousUnitPricePoisha,
    newUnitPricePoisha,
    note,
  } = params;

  const readableDate = formatReadableDate(date);
  const prevQtyLabel = previousQuantity === 1 ? "1 meal" : `${previousQuantity} meals`;
  const newQtyLabel = newQuantity === 1 ? "1 meal" : `${newQuantity} meals`;
  const priceChanged =
    previousUnitPricePoisha !== undefined && previousUnitPricePoisha !== newUnitPricePoisha;
  const updatedTotal = formatBDT(newQuantity * newUnitPricePoisha);
  const newPriceStr = formatBDT(newUnitPricePoisha);

  const subject = `Meal Adjustment Confirmation - ${readableDate}`;
  const textLines = [
    `Hello ${guestName},`,
    ``,
    `Your meal schedule has been adjusted by the administrator.`,
    ``,
    `Meal Date: ${readableDate}`,
    `Previous Meal Quantity: ${prevQtyLabel}`,
    `Updated Meal Quantity: ${newQtyLabel}`,
    ...(priceChanged
      ? [
          `Previous Price: ${formatBDT(previousUnitPricePoisha!)}`,
          `Updated Price: ${newPriceStr}`,
        ]
      : [`Meal Price: ${newPriceStr} per meal`]),
    `Updated Total: ${updatedTotal}`,
    ...(note ? [``, `Admin Note: ${note}`] : []),
    ``,
    `If you have any questions regarding this adjustment, please contact the administrator.`,
    ``,
    `Thank you.`,
  ];

  const html = wrapEmailLayout(
    "Meal Adjustment Confirmation",
    `<p>Hello <strong>${escapeHtml(guestName)}</strong>,</p>
     <p>Your meal schedule for <strong>${escapeHtml(readableDate)}</strong> has been adjusted by the administrator.</p>
     <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:8px;">
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Previous Quantity</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(prevQtyLabel)}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Updated Quantity</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${escapeHtml(newQtyLabel)}</td></tr>
       ${
         priceChanged
           ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Previous Price</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(formatBDT(previousUnitPricePoisha!))}</td></tr>
              <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Updated Price</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(newPriceStr)}</td></tr>`
           : `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Meal Price</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(newPriceStr)} / meal</td></tr>`
       }
       <tr><td style="padding:8px 12px;">Updated Total</td><td style="padding:8px 12px;text-align:right;font-weight:700;color:#0f172a;">${escapeHtml(updatedTotal)}</td></tr>
     </table>
     ${note ? `<p style="background:#eff6ff;padding:10px 12px;border-radius:6px;font-size:13px;"><strong>Admin Note:</strong> ${escapeHtml(note)}</p>` : ""}
     <p>If you have any questions regarding this adjustment, please contact the administrator.</p>
     <p>Thank you.</p>`
  );

  return { subject, text: textLines.join("\n"), html };
}
