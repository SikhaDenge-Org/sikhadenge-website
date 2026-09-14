import type { RenderedEmail } from "./types";

export type EmailTemplateSnapshot = {
  templateId: string;
  templateVersion: number;
  senderIdentityId: string;
  rendered: RenderedEmail;
  attachmentAssetIds: string[];
  createdAt: string;
};

export function createEmailTemplateSnapshot(input: Omit<EmailTemplateSnapshot, "createdAt">): EmailTemplateSnapshot {
  return {
    ...input,
    attachmentAssetIds: [...input.attachmentAssetIds],
    rendered: { ...input.rendered, variables: { ...input.rendered.variables } },
    createdAt: new Date().toISOString(),
  };
}
