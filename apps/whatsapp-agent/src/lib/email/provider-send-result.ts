import type { EmailSendResult } from "./types";

export function emailDryRunResult(): EmailSendResult {
  return {
    accepted: true,
    providerMessageId: null,
    providerThreadId: null,
    status: "QUEUED",
    externalRequestSent: false,
  };
}
