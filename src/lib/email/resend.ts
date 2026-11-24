import { Resend } from "resend";

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function getFromAddress(): string {
  const email = process.env.RESEND_FROM_EMAIL?.trim() || "meals@example.com";
  const name = process.env.RESEND_FROM_NAME?.trim() || "Office Meal Management";
  return `${name} <${email}>`;
}
