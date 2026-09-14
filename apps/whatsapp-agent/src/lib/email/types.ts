export type EmailProvider =
  | "GOOGLE_GMAIL"
  | "MICROSOFT_365"
  | "BREVO"
  | "AMAZON_SES"
  | "RESEND";

export type EmailConnectionStatus =
  | "PENDING"
  | "CONNECTED"
  | "DEGRADED"
  | "DISCONNECTED"
  | "REVOKED";

export type EmailSenderVerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "FAILED"
  | "REVOKED";

export type EmailTemplateStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "ARCHIVED";

export type EmailMessageStatus =
  | "DRAFT"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "OPENED"
  | "CLICKED"
  | "REPLIED"
  | "BOUNCED"
  | "COMPLAINED"
  | "FAILED"
  | "CANCELLED";

export type EmailDirection = "INBOUND" | "OUTBOUND";

export type EmailAssetKind = "INLINE_IMAGE" | "ATTACHMENT" | "DOCUMENT";

export type EmailRuntimeMode =
  | "disabled"
  | "dry_run"
  | "internal_recipients"
  | "limited_cohort"
  | "live";

export type EmailAddress = {
  email: string;
  name?: string | null;
};

export type EmailAttachment = {
  id?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey?: string | null;
  contentId?: string | null;
  publicUrl?: string | null;
};

export type RenderedEmail = {
  subject: string;
  preheader?: string | null;
  htmlBody: string;
  textBody: string;
  variables: Record<string, string>;
};

export type EmailSendRequest = {
  workspaceId: string;
  connectionId: string;
  senderIdentityId: string;
  from: EmailAddress;
  replyTo?: EmailAddress | null;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  rendered: RenderedEmail;
  attachments?: EmailAttachment[];
  idempotencyKey: string;
  providerThreadId?: string | null;
};

export type EmailSendResult = {
  accepted: boolean;
  providerMessageId: string | null;
  providerThreadId: string | null;
  status: EmailMessageStatus;
  externalRequestSent: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type EmailConnectionHealth = {
  provider: EmailProvider;
  verified: boolean;
  checkedAt: string;
  accountReference: string | null;
  reason: string;
  externalWriteSent: false;
};

export interface EmailProviderAdapter {
  readonly provider: EmailProvider;
  verifyConnection(connectionId: string): Promise<EmailConnectionHealth>;
  sendMessage(request: EmailSendRequest): Promise<EmailSendResult>;
}
