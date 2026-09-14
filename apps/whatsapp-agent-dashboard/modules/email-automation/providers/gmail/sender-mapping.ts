import type { EmailSenderIdentity } from "../../domain/contracts";

export type GmailSendAsResource = {
  sendAsEmail: string;
  displayName?: string | null;
  replyToAddress?: string | null;
  isPrimary?: boolean | null;
  isDefault?: boolean | null;
  verificationStatus?: string | null;
};

function normalizeVerificationStatus(value: string | null | undefined): EmailSenderIdentity["verificationStatus"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "accepted") return "VERIFIED";
  if (normalized === "pending") return "PENDING";
  if (normalized === "rejected") return "FAILED";
  return "PENDING";
}

export function gmailSendAsToSenderIdentity(input: {
  workspaceId: string;
  connectionId: string;
  resource: GmailSendAsResource;
}): EmailSenderIdentity {
  const email = input.resource.sendAsEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Gmail send-as resource does not contain a valid email address.");
  }

  return {
    id: `gmail:${input.connectionId}:${email}`,
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
    provider: "GOOGLE_GMAIL",
    fromName: input.resource.displayName?.trim() || email,
    fromEmail: email,
    replyToEmail: input.resource.replyToAddress?.trim().toLowerCase() || null,
    externalSenderId: email,
    verificationStatus: normalizeVerificationStatus(input.resource.verificationStatus),
    isDefault: input.resource.isDefault === true || input.resource.isPrimary === true,
    isActive: true,
    dailyLimit: null,
  };
}
