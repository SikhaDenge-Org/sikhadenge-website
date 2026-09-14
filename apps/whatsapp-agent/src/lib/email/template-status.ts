import type { EmailTemplateStatus } from "./types";

const ALLOWED: Record<EmailTemplateStatus, EmailTemplateStatus[]> = {
  DRAFT: ["IN_REVIEW", "ARCHIVED"],
  IN_REVIEW: ["DRAFT", "APPROVED", "ARCHIVED"],
  APPROVED: ["DRAFT", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

export function assertEmailTemplateTransition(from: EmailTemplateStatus, to: EmailTemplateStatus): void {
  if (from === to) return;
  if (!ALLOWED[from].includes(to)) throw new Error(`Email template transition ${from} -> ${to} is not allowed.`);
}
