const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const AADHAAR_PATTERN = /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;
const OTP_PATTERN = /\b(?:otp|one[ -]?time password|verification code|ओटीपी)\s*[:=-]?\s*\d{4,8}\b/gi;
const SECRET_PATTERN = /\b(?:cvv|upi pin|atm pin|password|passcode|access token|api key|secret)\s*[:=-]?\s*\S+/gi;

export type RedactionResult = {
  text: string;
  redacted: boolean;
  categories: string[];
};

export function redactLearningText(value: string): RedactionResult {
  let text = value.trim().replace(/\r\n?/g, "\n");
  const categories = new Set<string>();

  const replace = (pattern: RegExp, category: string) => {
    pattern.lastIndex = 0;
    if (!pattern.test(text)) return;
    categories.add(category);
    pattern.lastIndex = 0;
    text = text.replace(pattern, `[REDACTED_${category}]`);
  };

  replace(OTP_PATTERN, "OTP");
  replace(SECRET_PATTERN, "SECRET");
  replace(EMAIL_PATTERN, "EMAIL");

  // A 16-digit payment card begins with a valid 12-digit Aadhaar-shaped prefix.
  // Redact the longer payment-number pattern first so it cannot be partially
  // consumed and leave sensitive trailing digits behind.
  replace(CARD_PATTERN, "PAYMENT_NUMBER");
  replace(AADHAAR_PATTERN, "AADHAAR");
  replace(PHONE_PATTERN, "PHONE");

  return {
    text: text.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim(),
    redacted: categories.size > 0,
    categories: Array.from(categories).sort(),
  };
}

export function normalizeLearningText(value: string, maximum: number): string {
  const redacted = redactLearningText(value).text;
  const normalized = redacted.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Learning text is required.");
  return normalized.slice(0, maximum);
}
