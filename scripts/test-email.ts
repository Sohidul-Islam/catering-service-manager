import dotenv from "dotenv";
dotenv.config();

import { getFromAddress, getTransporter } from "../src/lib/email/mailer";

async function main() {
  const targetEmail = process.argv[2] || process.env.SMTP_USER || "test@example.com";
  console.log(`\n📧 Testing Nodemailer (Gmail SMTP) configuration...`);
  console.log(`SMTP_HOST: ${process.env.SMTP_HOST || "smtp.gmail.com"}`);
  console.log(`SMTP_PORT: ${process.env.SMTP_PORT || "465"}`);
  console.log(`SMTP_USER: ${process.env.SMTP_USER || "(not set)"}`);
  console.log(`SMTP_PASS: ${process.env.SMTP_PASS ? "******** (configured)" : "(NOT CONFIGURED)"}`);
  console.log(`Sending from: ${getFromAddress()}`);
  console.log(`Sending to: ${targetEmail}\n`);

  const transporter = getTransporter();
  if (!transporter) {
    console.error("❌ SMTP transporter could not be initialized.");
    console.error("👉 Please ensure SMTP_USER and SMTP_PASS are set in .env.");
    process.exit(1);
  }

  try {
    console.log("⏳ Verifying SMTP connection credentials...");
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully!");

    console.log(`⏳ Sending test email to ${targetEmail}...`);
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: targetEmail,
      subject: "Test Email from mw-catering-service",
      text: "Hello! This is a test email sent using Nodemailer (Gmail SMTP). Resend has been completely removed.",
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2563eb;">✅ Nodemailer (Gmail SMTP) Working!</h2>
          <p>Hello,</p>
          <p>This confirms that your email delivery is now powered 100% by <strong>Nodemailer</strong>.</p>
          <p>You can send emails to <strong>any recipient</strong> without needing a custom domain.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6b7280;">Sent via mw-catering-service</p>
        </div>
      `,
    });

    console.log(`✅ Email sent successfully! MessageId: ${info.messageId}\n`);
  } catch (error: any) {
    console.error("❌ Failed to send email:");
    console.error(error?.message || error);
    process.exit(1);
  }
}

main();
