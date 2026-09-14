import type { SenderCandidate } from "./sender-resolution";

export const VERIFIED_EMAIL_SENDER_FIXTURE: SenderCandidate = {
  id: "sender-primary",
  fromEmail: "mail@sikhadenge.in",
  fromName: "SikhaDenge",
  replyToEmail: "support@sikhadenge.in",
  verificationStatus: "VERIFIED",
  isActive: true,
  isDefault: true,
};
