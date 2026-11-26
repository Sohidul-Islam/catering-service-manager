import { escapeHtml, wrapEmailLayout, type EmailTemplateOutput } from "./meal-confirmation";

export interface GuestInvitationEmailParams {
  guestName: string;
  organizationName: string;
  inviteUrl: string;
  expiresInDays?: number;
}

export function renderGuestInvitationEmail(
  params: GuestInvitationEmailParams
): EmailTemplateOutput {
  const { guestName, organizationName, inviteUrl, expiresInDays = 14 } = params;

  const subject = `You're invited to ${organizationName}`;
  const text = [
    `Hello ${guestName},`,
    ``,
    `You have been invited to join ${organizationName} on the Office Meal Management System.`,
    ``,
    `Please accept your invitation and set your password using the link below:`,
    inviteUrl,
    ``,
    `This invitation link will expire in ${expiresInDays} days.`,
    ``,
    `Thank you.`,
  ].join("\n");

  const html = wrapEmailLayout(
    "You're Invited",
    `<p>Hello <strong>${escapeHtml(guestName)}</strong>,</p>
     <p>You have been invited to join <strong>${escapeHtml(organizationName)}</strong> on the Office Meal Management System.</p>
     <p>Click the button below to set your password and activate your account:</p>
     <p style="margin:24px 0;text-align:center;">
       <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">
         Accept Invitation
       </a>
     </p>
     <p style="font-size:13px;color:#64748b;">Or copy and paste this link into your browser:</p>
     <p style="font-size:12px;word-break:break-all;background:#f8fafc;padding:10px 12px;border:1px solid #e2e8f0;border-radius:6px;color:#0f172a;">
       ${escapeHtml(inviteUrl)}
     </p>
     <p style="font-size:12px;color:#64748b;margin-top:16px;">
       This invitation link will expire in ${expiresInDays} days.
     </p>`
  );

  return { subject, text, html };
}
