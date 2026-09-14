import type { RenderedEmail } from "./types";

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function renderValue(input: string, variables: Record<string, string>): string {
  return input.replace(VARIABLE_PATTERN, (_match, key: string) => variables[key] ?? "");
}

export function renderEmailTemplate(input: {
  subject: string;
  preheader?: string | null;
  htmlBody: string;
  textBody: string;
  variables: Record<string, string>;
  requiredVariables?: string[];
}): RenderedEmail {
  const required = input.requiredVariables ?? [];
  const missing = required.filter((key) => !input.variables[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required email variables: ${missing.join(", ")}.`);
  }

  const subject = renderValue(input.subject, input.variables).trim();
  const preheader = input.preheader ? renderValue(input.preheader, input.variables).trim() : null;
  const htmlBody = renderValue(input.htmlBody, input.variables);
  const textBody = renderValue(input.textBody, input.variables);

  if (!subject) throw new Error("Rendered email subject is empty.");
  if (!htmlBody.trim() && !textBody.trim()) throw new Error("Rendered email body is empty.");

  return {
    subject,
    preheader,
    htmlBody,
    textBody,
    variables: { ...input.variables },
  };
}
