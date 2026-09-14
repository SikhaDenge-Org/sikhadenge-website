export type EmailProviderError = {
  code: string;
  message: string;
  retryable: boolean;
};

export function normalizeEmailProviderError(error: unknown): EmailProviderError {
  const message = error instanceof Error ? error.message : String(error || "Email provider request failed.");
  return {
    code: "EMAIL_PROVIDER_ERROR",
    message: message.replace(/\s+/g, " ").trim().slice(0, 500),
    retryable: false,
  };
}
