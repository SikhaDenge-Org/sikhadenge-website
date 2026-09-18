export const EMAIL_DELIVERY_RETRY_SAFE_PREFIX = "[DELIVERY_RETRY_SAFE]";
export const EMAIL_AUTOMATION_RETRY_PENDING_PREFIX = "[AUTO_RETRY_PENDING]";
export const EMAIL_AUTOMATION_AUTO_MAX_ATTEMPTS = 5;
export const EMAIL_AUTOMATION_MANUAL_MAX_ATTEMPTS = 20;

export type EmailProviderFailureClassification = {
  message: string;
  statusCode: number | null;
  safeToRetry: boolean;
  autoRetryable: boolean;
  category: "RATE_LIMIT" | "TRANSIENT_PROVIDER" | "PERMANENT_PROVIDER" | "UNKNOWN";
};

const AUTO_RETRY_STATUSES = new Set([429, 502, 503, 504]);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Email provider operation failed.");
}

function httpStatus(message: string): number | null {
  const match = message.match(/\bHTTP\s+(\d{3})\b/i);
  return match ? Number(match[1]) : null;
}

function explicitProviderRejection(message: string): boolean {
  return /Gmail message send failed with HTTP|Microsoft Graph sendMail failed with HTTP|Google OAuth token refresh failed with HTTP|Microsoft token refresh failed with HTTP/i.test(message);
}

export function classifyEmailProviderFailure(error: unknown): EmailProviderFailureClassification {
  const message = messageOf(error);
  const statusCode = httpStatus(message);
  const safeToRetry = statusCode !== null && explicitProviderRejection(message);
  const autoRetryable = safeToRetry && AUTO_RETRY_STATUSES.has(statusCode!);
  const category =
    statusCode === 429 ? "RATE_LIMIT" :
    autoRetryable ? "TRANSIENT_PROVIDER" :
    safeToRetry ? "PERMANENT_PROVIDER" :
    "UNKNOWN";
  return { message, statusCode, safeToRetry, autoRetryable, category };
}

export function persistedEmailDeliveryError(error: unknown): string {
  const classification = classifyEmailProviderFailure(error);
  return classification.safeToRetry
    ? `${EMAIL_DELIVERY_RETRY_SAFE_PREFIX} ${classification.message}`
    : classification.message;
}

export function isPersistedDeliveryRetrySafe(lastError: string | null | undefined): boolean {
  return Boolean(lastError?.startsWith(EMAIL_DELIVERY_RETRY_SAFE_PREFIX));
}

export function isPendingEmailAutomationRetry(lastError: string | null | undefined): boolean {
  return Boolean(lastError?.startsWith(EMAIL_AUTOMATION_RETRY_PENDING_PREFIX));
}

export function computeEmailAutomationRetryDelayMs(
  attemptCount: number,
  random: () => number = Math.random,
): number {
  const attempt = Math.max(1, Math.floor(attemptCount));
  const base = Math.min(30_000 * 2 ** (attempt - 1), 3_600_000);
  const sample = Math.min(Math.max(random(), 0), 1);
  const jitter = 0.75 + sample * 0.5;
  return Math.min(Math.max(Math.round(base * jitter), 5_000), 3_600_000);
}

export function emailAutomationPendingRetryError(error: unknown): string {
  return `${EMAIL_AUTOMATION_RETRY_PENDING_PREFIX} ${messageOf(error)}`;
}
