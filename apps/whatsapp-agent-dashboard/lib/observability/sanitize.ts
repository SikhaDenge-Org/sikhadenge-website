const SENSITIVE_KEY = /(password|passcode|secret|token|authorization|cookie|otp|cvv|pin|api[-_]?key|access[-_]?key)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g;
const LONG_NUMBER = /(?<!\d)\d(?:[ -]?\d){11,18}(?!\d)/g;

function sanitizeString(value: string): string {
  return value
    .replace(EMAIL, "[REDACTED_EMAIL]")
    // Phone numbers are a more specific form of numeric PII. Redact them
    // before the generic 12-19 digit pattern so an Indian country code is not
    // partially consumed and left as a stray "+" prefix.
    .replace(PHONE, "[REDACTED_PHONE]")
    // Match the complete 12-19 digit sequence greedily. The previous lazy
    // repetition stopped after 12 digits and could leave trailing card digits.
    .replace(LONG_NUMBER, "[REDACTED_NUMBER]")
    .slice(0, 2_000);
}

export function sanitizeOperationalValue(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 6) return "[TRUNCATED_DEPTH]";
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeOperationalValue(entry, depth + 1));
  }
  if (typeof value !== "object") return String(value).slice(0, 500);

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    result[key] = SENSITIVE_KEY.test(key)
      ? "[REDACTED_SECRET]"
      : sanitizeOperationalValue(entry, depth + 1);
  }
  return result;
}

export function compactOperationalError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeString(message).slice(0, 1_000);
}
