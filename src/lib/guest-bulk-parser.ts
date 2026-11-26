import { z } from "zod";

const emailSchema = z.string().email();

export interface ParsedBulkGuest {
  raw: string;
  email: string;
  name: string;
  isNameGenerated: boolean;
}

export interface InvalidBulkGuest {
  raw: string;
  email: string;
  reason: string;
}

export interface BulkGuestParseResult {
  valid: ParsedBulkGuest[];
  invalid: InvalidBulkGuest[];
}

/**
 * Generates a readable title-cased name from an email address's local part
 * by converting common separators (., _, -) into spaces.
 */
export function generateNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const cleaned = localPart.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Guest";

  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Parses bulk guest input supporting:
 * - One entry per line with optional name: `john@example.com, John Doe`
 * - Email-only lines: `mike@example.com`
 * - Comma-separated emails on a single line: `a@example.com, b@example.com`
 * Ignores empty segments from extra commas or whitespace, validates emails,
 * and flags duplicate emails within the input.
 */
export function parseBulkGuestInput(rawInput: string): BulkGuestParseResult {
  const valid: ParsedBulkGuest[] = [];
  const invalid: InvalidBulkGuest[] = [];
  const seenEmails = new Set<string>();

  const lines = rawInput.split(/\r?\n/);

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) continue;

    const parts = trimmedLine
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (parts.length === 0) continue;

    // If multiple comma-separated parts and more than one contains '@',
    // treat each part as a separate email entry.
    const emailLikeCount = parts.filter((p) => p.includes("@")).length;
    const entries: { email: string; name?: string; raw: string }[] =
      parts.length > 1 && emailLikeCount <= 1
        ? [
            {
              email: parts[0],
              name: parts.slice(1).join(" ").trim() || undefined,
              raw: trimmedLine,
            },
          ]
        : parts.map((p) => ({
            email: p,
            name: undefined,
            raw: p,
          }));

    for (const entry of entries) {
      const normalizedEmail = entry.email.toLowerCase().trim();
      const parsedEmail = emailSchema.safeParse(normalizedEmail);

      if (!parsedEmail.success) {
        invalid.push({
          raw: entry.raw,
          email: entry.email,
          reason: "Invalid email address",
        });
        continue;
      }

      if (seenEmails.has(normalizedEmail)) {
        invalid.push({
          raw: entry.raw,
          email: normalizedEmail,
          reason: "Duplicate email in list",
        });
        continue;
      }

      seenEmails.add(normalizedEmail);
      const hasExplicitName = Boolean(entry.name && entry.name.trim().length > 0);
      const resolvedName = hasExplicitName
        ? entry.name!.trim().slice(0, 120)
        : generateNameFromEmail(normalizedEmail);

      valid.push({
        raw: entry.raw,
        email: normalizedEmail,
        name: resolvedName,
        isNameGenerated: !hasExplicitName,
      });
    }
  }

  return { valid, invalid };
}
