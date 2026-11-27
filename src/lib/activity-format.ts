export function formatActivityValue(raw: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const hiddenKeys = new Set(["messageId", "invoiceId"]);
      const entries = Object.entries(parsed).filter(
        ([k, v]) => !hiddenKeys.has(k) && v !== undefined && v !== null && v !== ""
      );
      if (entries.length > 0) {
        return entries
          .map(([k, v]) => {
            const label = k
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (c) => c.toUpperCase());
            return `${label}: ${String(v)}`;
          })
          .join(" • ");
      }
    } catch {
      // Fallback to raw string if not valid JSON
    }
  }
  return raw;
}

export function formatActivityDetails(
  previousValue: string | null,
  newValue: string | null,
  reason: string | null
): string {
  const prevFormatted = formatActivityValue(previousValue);
  const nextFormatted = formatActivityValue(newValue);
  const transition =
    prevFormatted && nextFormatted
      ? `${prevFormatted} → ${nextFormatted}`
      : nextFormatted || prevFormatted;
  if (transition && reason) return `${transition} (${reason})`;
  return transition || reason || "—";
}
