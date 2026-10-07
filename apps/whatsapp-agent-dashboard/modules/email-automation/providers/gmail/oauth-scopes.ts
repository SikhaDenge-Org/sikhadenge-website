export const GMAIL_IDENTITY_SCOPES = [
  "openid",
  "email",
  "profile",
] as const;

export const GMAIL_OUTBOUND_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.settings.basic",
] as const;

export const GMAIL_INBOUND_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

/**
 * E1 requests only identity + outbound/sender-management access.
 * E5 inbound mailbox access must be requested as a deliberate scope upgrade,
 * not bundled into the first connection flow.
 */
export function gmailScopesForPhase(input: { inboundEnabled: boolean }): readonly string[] {
  return [
    ...GMAIL_IDENTITY_SCOPES,
    ...GMAIL_OUTBOUND_SCOPES,
    ...(input.inboundEnabled ? GMAIL_INBOUND_SCOPES : []),
  ];
}
