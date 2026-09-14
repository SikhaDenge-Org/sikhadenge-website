export type EmailRetryDecision = {
  retry: boolean;
  delayMs: number;
  reason: string;
};

export function emailRetryDecision(input: { attempt: number; retryable: boolean }): EmailRetryDecision {
  if (!input.retryable) return { retry: false, delayMs: 0, reason: "Provider error is not retryable." };
  if (input.attempt >= 5) return { retry: false, delayMs: 0, reason: "Maximum email retry attempts reached." };
  const delayMs = Math.min(15 * 60_000, Math.max(30_000, 30_000 * 2 ** Math.max(0, input.attempt - 1)));
  return { retry: true, delayMs, reason: "Retryable provider failure." };
}
