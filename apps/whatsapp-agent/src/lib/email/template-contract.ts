import type { EmailTemplateStatus } from "./types";

export type EmailTemplateVariable = {
  key: string;
  label: string;
  required: boolean;
  fallback?: string | null;
};

export type EmailTemplateContentBlock =
  | { id: string; type: "TEXT"; html: string }
  | { id: string; type: "IMAGE"; assetId: string; alt: string; linkUrl?: string | null }
  | { id: string; type: "BUTTON"; label: string; url: string; alignment?: "left" | "center" | "right" }
  | { id: string; type: "DIVIDER" }
  | { id: string; type: "SPACER"; height: number }
  | { id: string; type: "HTML"; html: string };

export type EmailTemplateDraft = {
  name: string;
  category: string;
  status: EmailTemplateStatus;
  subject: string;
  preheader: string;
  htmlBody: string;
  textBody: string;
  defaultSenderIdentityId: string | null;
  replyToOverride: string | null;
  variables: EmailTemplateVariable[];
  contentBlocks: EmailTemplateContentBlock[];
  tags: string[];
};

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function extractEmailTemplateVariables(...values: string[]): string[] {
  const variables = new Set<string>();
  for (const value of values) {
    for (const match of value.matchAll(VARIABLE_PATTERN)) variables.add(match[1]);
  }
  return [...variables].sort();
}

export function validateEmailTemplateDraft(draft: EmailTemplateDraft): string[] {
  const errors: string[] = [];
  if (draft.name.trim().length < 3) errors.push("Template name must contain at least 3 characters.");
  if (!draft.subject.trim()) errors.push("Email subject is required.");
  if (!draft.htmlBody.trim() && !draft.textBody.trim()) errors.push("Email body is required.");
  if (draft.subject.length > 255) errors.push("Email subject cannot exceed 255 characters.");
  if (draft.preheader.length > 300) errors.push("Email preheader cannot exceed 300 characters.");

  const declared = new Set(draft.variables.map((variable) => variable.key));
  const used = extractEmailTemplateVariables(
    draft.subject,
    draft.preheader,
    draft.htmlBody,
    draft.textBody,
  );
  for (const variable of used) {
    if (!declared.has(variable)) errors.push(`Template variable ${variable} is used but not declared.`);
  }
  return errors;
}
