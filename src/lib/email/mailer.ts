import nodemailer, { type Transporter } from "nodemailer";

let cachedTransporter: Transporter | null = null;

export function getTransporter(): Transporter | null {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim().replace(/\s+/g, "");

  if (!user || !pass) {
    return null;
  }

  if (cachedTransporter) {
    return cachedTransporter;
  }

  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure =
    process.env.SMTP_SECURE === "true" ||
    (process.env.SMTP_SECURE !== "false" && port === 465);

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return cachedTransporter;
}

export function getFromAddress(): string {
  const name = process.env.SMTP_FROM_NAME?.trim() || "mw-catering-service";
  const email =
    process.env.SMTP_FROM_EMAIL?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "meals@example.com";

  return `"${name}" <${email}>`;
}
