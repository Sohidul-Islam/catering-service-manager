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

export interface AdjustmentRequestAdminEmailParams {
  guestName: string;
  guestEmail: string;
  date: string;
  currentQuantity: number;
  requestedQuantity: number;
  reason?: string | null;
  reviewUrl: string;
}

export function renderAdjustmentRequestAdminEmail(
  params: AdjustmentRequestAdminEmailParams
): EmailTemplateOutput {
  const {
    guestName,
    guestEmail,
    date,
    currentQuantity,
    requestedQuantity,
    reason,
    reviewUrl,
  } = params;

  const readableDate = formatReadableDate(date);
  const currLabel = currentQuantity === 1 ? "1 meal" : `${currentQuantity} meals`;
  const reqLabel = requestedQuantity === 1 ? "1 meal" : `${requestedQuantity} meals`;

  const subject = `Meal Adjustment Request from ${guestName} - ${readableDate}`;
  const text = [
    `New Meal Adjustment Request`,
    ``,
    `Guest: ${guestName} (${guestEmail})`,
    `Meal Date: ${readableDate}`,
    `Current Quantity: ${currLabel}`,
    `Requested Quantity: ${reqLabel}`,
    reason ? `Reason: ${reason}` : "",
    ``,
    `Review this request in the Admin Portal:`,
    reviewUrl,
  ]
    .filter(Boolean)
    .join("\n");

  const html = wrapEmailLayout(
    "New Meal Adjustment Request",
    `<p><strong>${escapeHtml(guestName)}</strong> (${escapeHtml(guestEmail)}) has requested a meal adjustment.</p>
     <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:8px;">
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Meal Date</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${escapeHtml(readableDate)}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Current Quantity</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(currLabel)}</td></tr>
       <tr><td style="padding:8px 12px;">Requested Quantity</td><td style="padding:8px 12px;text-align:right;font-weight:700;color:#2563eb;">${escapeHtml(reqLabel)}</td></tr>
     </table>
     ${reason ? `<p style="background:#eff6ff;padding:10px 12px;border-radius:6px;font-size:13px;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ""}
     <p style="margin:24px 0;text-align:center;">
       <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 20px;border-radius:8px;">
         Review Adjustment Requests
       </a>
     </p>`
  );

  return { subject, text, html };
}

export interface AdjustmentDecisionEmailParams {
  guestName: string;
  date: string;
  currentQuantity: number;
  requestedQuantity: number;
  decision: "APPROVED" | "REJECTED";
  reviewNote?: string | null;
}

export function renderAdjustmentDecisionEmail(
  params: AdjustmentDecisionEmailParams
): EmailTemplateOutput {
  const { guestName, date, currentQuantity, requestedQuantity, decision, reviewNote } = params;
  const readableDate = formatReadableDate(date);
  const currLabel = currentQuantity === 1 ? "1 meal" : `${currentQuantity} meals`;
  const reqLabel = requestedQuantity === 1 ? "1 meal" : `${requestedQuantity} meals`;
  const isApproved = decision === "APPROVED";
  const statusText = isApproved ? "Approved" : "Rejected";
  const statusColor = isApproved ? "#059669" : "#dc2626";

  const subject = `Meal Adjustment Request ${statusText} - ${readableDate}`;
  const text = [
    `Hello ${guestName},`,
    ``,
    `Your meal adjustment request for ${readableDate} has been ${statusText.toLowerCase()}.`,
    ``,
    `Meal Date: ${readableDate}`,
    `Previous Quantity: ${currLabel}`,
    `Requested Quantity: ${reqLabel}`,
    `Decision: ${statusText}`,
    reviewNote ? `Admin Note: ${reviewNote}` : "",
    ``,
    isApproved
      ? `Your meal schedule has been updated to ${reqLabel}.`
      : `Your meal quantity remains ${currLabel}.`,
    ``,
    `Thank you.`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = wrapEmailLayout(
    `Meal Adjustment ${statusText}`,
    `<p>Hello <strong>${escapeHtml(guestName)}</strong>,</p>
     <p>Your meal adjustment request for <strong>${escapeHtml(readableDate)}</strong> has been <strong style="color:${statusColor};">${statusText.toLowerCase()}</strong>.</p>
     <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:8px;">
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Meal Date</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${escapeHtml(readableDate)}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Previous Quantity</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(currLabel)}</td></tr>
       <tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">Requested Quantity</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(reqLabel)}</td></tr>
       <tr><td style="padding:8px 12px;">Decision</td><td style="padding:8px 12px;text-align:right;font-weight:700;color:${statusColor};">${statusText}</td></tr>
     </table>
     ${reviewNote ? `<p style="background:#eff6ff;padding:10px 12px;border-radius:6px;font-size:13px;"><strong>Admin Note:</strong> ${escapeHtml(reviewNote)}</p>` : ""}
     <p>${isApproved ? `Your meal schedule has been updated to <strong>${escapeHtml(reqLabel)}</strong>.` : `Your meal quantity remains <strong>${escapeHtml(currLabel)}</strong>.`}</p>
     <p>Thank you.</p>`
  );

  return { subject, text, html };
}
