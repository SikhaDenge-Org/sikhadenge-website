import type { EmailConnectionHealth, EmailProvider } from "./types";

export function unavailableEmailProviderHealth(provider: EmailProvider, reason: string): EmailConnectionHealth {
  return {
    provider,
    verified: false,
    checkedAt: new Date().toISOString(),
    accountReference: null,
    reason: reason.replace(/\s+/g, " ").trim().slice(0, 300),
    externalWriteSent: false,
  };
}
