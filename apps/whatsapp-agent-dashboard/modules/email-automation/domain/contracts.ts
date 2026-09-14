export const EMAIL_PROVIDERS = [
  "GOOGLE_GMAIL",
  "MICROSOFT_365",
  "BREVO",
  "AMAZON_SES",
  "RESEND",
] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export const EMAIL_CONNECTION_STATUSES = [
  "PENDING",
  "CONNECTED",
  "DEGRADED",
  "EXPIRED",
  "REVOKED",
  "DISCONNECTED",
] as const;
export type EmailConnectionStatus = (typeof EMAIL_CONNECTION_STATUSES)[number];

export const EMAIL_SENDER_VERIFICATION_STATUSES = [
  "PENDING",
  "VERIFIED",
  "FAILED",
  "REVOKED",
] as const;
export type EmailSenderVerificationStatus =
  (typeof EMAIL_SENDER_VERIFICATION_STATUSES)[number];

export const EMAIL_RUNTIME_MODES = [
  "DISABLED",
  "DRY_RUN",
  "INTERNAL_RECIPIENTS",
  "LIMITED_COHORT",
  "LIVE",
] as const;
export type EmailRuntimeMode = (typeof EMAIL_RUNTIME_MODES)[number];

export const EMAIL_TEMPLATE_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "ARCHIVED",
] as const;
export type EmailTemplateStatus = (typeof EMAIL_TEMPLATE_STATUSES)[number];

export const EMAIL_MESSAGE_STATUSES = [
  "DRAFT",
  "QUEUED",
  "SENDING",
  "SENT",
  "DELIVERED",
  "BOUNCED",
  "FAILED",
  "CANCELLED",
] as const;
export type EmailMessageStatus = (typeof EMAIL_MESSAGE_STATUSES)[number];

export type EmailConnection = {
  id: string;
  workspaceId: string;
  provider: EmailProvider;
  displayName: string;
  externalAccountId: string | null;
  status: EmailConnectionStatus;
  connectedAt: Date | null;
  lastVerifiedAt: Date | null;
  revokedAt: Date | null;
};

export type EmailSenderIdentity = {
  id: string;
  workspaceId: string;
  connectionId: string;
  provider: EmailProvider;
  fromName: string;
  fromEmail: string;
  replyToEmail: string | null;
  externalSenderId: string | null;
  verificationStatus: EmailSenderVerificationStatus;
  isDefault: boolean;
  isActive: boolean;
  dailyLimit: number | null;
};

export type EmailAddress = {
  email: string;
  name?: string;
};

export type EmailAttachmentReference = {
  assetId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  disposition: "ATTACHMENT" | "INLINE";
  contentId?: string;
};

export type EmailRenderedContent = {
  subject: string;
  preheader?: string;
  html: string;
  text: string;
  variables: Readonly<Record<string, string>>;
};

export type EmailSendRequest = {
  workspaceId: string;
  connectionId: string;
  senderIdentityId: string;
  to: readonly EmailAddress[];
  cc?: readonly EmailAddress[];
  bcc?: readonly EmailAddress[];
  replyTo?: EmailAddress;
  rendered: EmailRenderedContent;
  attachments?: readonly EmailAttachmentReference[];
  idempotencyKey: string;
  providerThreadId?: string;
};

export type EmailSendResult = {
  accepted: boolean;
  status: EmailMessageStatus;
  providerMessageId: string | null;
  providerThreadId: string | null;
  externalRequestSent: boolean;
};
