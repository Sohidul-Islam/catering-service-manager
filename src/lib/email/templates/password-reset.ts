import { escapeHtml, wrapEmailLayout, type EmailTemplateOutput } from "./meal-confirmation";

export interface PasswordResetEmailParams {
  guestName: string;
  organizationName: string;
  resetUrl: string;
  expiresInMinutes?: number;
  initiatedByAdmin?: boolean;
}

export function renderPasswordResetEmail(
  params: PasswordResetEmailParams
): EmailTemplateOutput {
  const {
    guestName,
    organizationName,
    resetUrl,
    expiresInMinutes = 60,
    initiatedByAdmin = false,
  } = params;

  const subject = `Reset your password • ${organizationName}`;
  const introText = initiatedByAdmin
    ? `An administrator at ${organizationName} sent you a password reset link for your Office Meal Management account.`
    : `We received a request to reset the password for your ${organizationName} Office Meal Management account.`;

  const text = [
    `Hello ${guestName},`,
    ``,
    introText,
    ``,
    `Click or open the link below to choose a new password:`,
    resetUrl,
    ``,
    `This link will expire in ${expiresInMinutes} minutes and can only be used once.`,
    `If you did not request a password reset, you can safely ignore this email.`,
    ``,
    `Thank you.`,
  ].join("\n");

  const html = wrapEmailLayout(
    "Reset Your Password",
    `<p>Hello <strong>${escapeHtml(guestName)}</strong>,</p>
     <p>${escapeHtml(introText)}</p>
     <p>Click the button below to set a new password:</p>
     <p style="margin:24px 0;text-align:center;">
       <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">
         Reset Password
       </a>
     </p>
     <p style="font-size:13px;color:#64748b;">Or copy and paste this link into your browser:</p>
     <p style="font-size:12px;word-break:break-all;background:#f8fafc;padding:10px 12px;border:1px solid #e2e8f0;border-radius:6px;color:#0f172a;">
       ${escapeHtml(resetUrl)}
     </p>
     <p style="font-size:12px;color:#64748b;margin-top:16px;">
       This password reset link will expire in <strong>${expiresInMinutes} minutes</strong> and can only be used once.
     </p>
     <p style="font-size:12px;color:#64748b;margin-top:8px;">
       If you did not request a password reset, you can safely ignore this email and your password will remain unchanged.
     </p>`
  );

  return { subject, text, html };
}
