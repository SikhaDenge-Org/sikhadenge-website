import type { EmailTemplateStatus } from "../domain/contracts";

export const EMAIL_TEMPLATE_CATEGORIES = [
  "TRANSACTIONAL",
  "LEAD_WELCOME",
  "MASTERCLASS",
  "ADMISSION",
  "FOLLOW_UP",
  "PAYMENT",
  "APPOINTMENT",
  "NURTURE",
  "RE_ENGAGEMENT",
  "CUSTOM",
] as const;
export type EmailTemplateCategory = (typeof EMAIL_TEMPLATE_CATEGORIES)[number];

export type EmailTemplateVariable = {
  key: string;
  label: string;
  required: boolean;
  fallback?: string;
};

export type EmailTemplateAsset = {
  id: string;
  kind: "INLINE_IMAGE" | "ATTACHMENT" | "DOCUMENT";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  contentId?: string;
};

export type EmailTemplateVersion = {
  id: string;
  workspaceId: string;
  templateId: string;
  version: number;
  name: string;
  category: EmailTemplateCategory;
  status: EmailTemplateStatus;
  subject: string;
  preheader: string | null;
  htmlBody: string;
  textBody: string;
  defaultSenderIdentityId: string | null;
  variables: readonly EmailTemplateVariable[];
  assets: readonly EmailTemplateAsset[];
  createdBy: string;
  approvedBy: string | null;
  createdAt: Date;
};

const ALLOWED_TRANSITIONS: Readonly<Record<EmailTemplateStatus, readonly EmailTemplateStatus[]>> = {
  DRAFT: ["IN_REVIEW", "ARCHIVED"],
  IN_REVIEW: ["DRAFT", "APPROVED", "ARCHIVED"],
  APPROVED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function assertEmailTemplateTransition(
  from: EmailTemplateStatus,
  to: EmailTemplateStatus,
): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Email template transition ${from} -> ${to} is not allowed.`);
  }
}

export function nextEmailTemplateVersion(current: number): number {
  if (!Number.isInteger(current) || current < 1) {
    throw new Error("Email template version must be a positive integer.");
  }
  return current + 1;
}
