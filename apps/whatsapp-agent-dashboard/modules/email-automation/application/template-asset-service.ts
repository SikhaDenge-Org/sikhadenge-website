import { prisma } from "@/lib/db/prisma";

import type { EmailTemplateDocument } from "../templates/blocks";
import { assertEmailTemplateDocument } from "../templates/validation";
import {
  deleteEmailAsset,
  newEmailAssetId,
  persistEmailAsset,
  readEmailAsset,
  validateEmailAsset,
  type EmailAssetKind,
} from "../infrastructure/email-template-asset-storage";
import { buildEmailTemplateRuntime } from "../infrastructure/template-runtime";

const VERSION_TOTAL_LIMIT = 20 * 1024 * 1024;

function safeFileName(value: string): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._()\- ]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "attachment").slice(0, 180);
}

function cloneDocument(document: EmailTemplateDocument): EmailTemplateDocument {
  return JSON.parse(JSON.stringify(document)) as EmailTemplateDocument;
}

export class EmailTemplateAssetService {
  async upload(input: {
    workspaceId: string;
    templateId: string;
    expectedCurrentVersion: number;
    kind: EmailAssetKind;
    file: File;
    imageBlockId?: string | null;
    actorUserId: string;
  }) {
    validateEmailAsset(input.file, input.kind);
    const runtime = buildEmailTemplateRuntime();
    const current = await runtime.service.get({ workspaceId: input.workspaceId, templateId: input.templateId });
    if (current.status !== "DRAFT") throw new Error("Email assets can only be uploaded to DRAFT templates.");
    if (current.currentVersion !== input.expectedCurrentVersion) {
      throw new Error("Email template draft has changed; reload before uploading an asset.");
    }

    const currentVersion = current.versions.find((item) => item.version === current.currentVersion);
    if (!currentVersion) throw new Error("Current email template version is missing.");
    const carriedSize = currentVersion.assets.reduce((sum, item) => sum + item.sizeBytes, 0);
    if (carriedSize + input.file.size > VERSION_TOTAL_LIMIT) {
      throw new Error("Email template attachments exceed the 20 MB per-version safety limit.");
    }

    const assetId = newEmailAssetId();
    const contentId = input.kind === "INLINE_IMAGE" ? `asset-${assetId}@sikhadenge` : null;
    const document = cloneDocument(currentVersion.document);
    if (input.kind === "INLINE_IMAGE") {
      if (!input.imageBlockId) throw new Error("imageBlockId is required for an inline image upload.");
      const block = document.blocks.find((item) => item.id === input.imageBlockId);
      if (!block || block.type !== "IMAGE") throw new Error("Selected email block is not an image block.");
      block.src = `cid:${contentId}`;
      block.assetId = assetId;
    }
    assertEmailTemplateDocument(document);

    const storageKey = await persistEmailAsset({ workspaceId: input.workspaceId, assetId, file: input.file });
    const nextVersion = input.expectedCurrentVersion + 1;

    try {
      await prisma.$transaction(async (tx) => {
        const sourceVersion = await tx.engageEmailTemplateVersion.findFirst({
          where: {
            workspaceId: input.workspaceId,
            templateId: input.templateId,
            version: input.expectedCurrentVersion,
          },
          include: { assets: true },
        });
        if (!sourceVersion) throw new Error("Current email template version is missing.");

        const updated = await tx.engageEmailTemplate.updateMany({
          where: {
            id: input.templateId,
            workspaceId: input.workspaceId,
            status: "DRAFT",
            currentVersion: input.expectedCurrentVersion,
          },
          data: { currentVersion: nextVersion },
        });
        if (updated.count !== 1) throw new Error("Email template draft changed concurrently.");

        const version = await tx.engageEmailTemplateVersion.create({
          data: {
            workspaceId: input.workspaceId,
            templateId: input.templateId,
            version: nextVersion,
            subject: document.subject,
            preheader: document.preheader,
            document: JSON.parse(JSON.stringify(document)),
            variables: JSON.parse(JSON.stringify(document.variables)),
            defaultSenderIdentityId: currentVersion.defaultSenderIdentityId,
            createdById: input.actorUserId,
          },
        });

        if (sourceVersion.assets.length) {
          await tx.engageEmailTemplateAsset.createMany({
            data: sourceVersion.assets.map((item) => ({
              workspaceId: input.workspaceId,
              templateId: input.templateId,
              versionId: version.id,
              kind: item.kind,
              fileName: item.fileName,
              mimeType: item.mimeType,
              sizeBytes: item.sizeBytes,
              storageKey: item.storageKey,
              contentId: item.contentId,
            })),
          });
        }

        await tx.engageEmailTemplateAsset.create({
          data: {
            id: assetId,
            workspaceId: input.workspaceId,
            templateId: input.templateId,
            versionId: version.id,
            kind: input.kind,
            fileName: safeFileName(input.file.name),
            mimeType: input.file.type.toLowerCase(),
            sizeBytes: input.file.size,
            storageKey,
            contentId,
          },
        });
      });
    } catch (error) {
      await deleteEmailAsset(storageKey);
      throw error;
    }

    return runtime.service.get({ workspaceId: input.workspaceId, templateId: input.templateId });
  }

  async read(input: { workspaceId: string; assetId: string }) {
    const asset = await prisma.engageEmailTemplateAsset.findFirst({
      where: { id: input.assetId, workspaceId: input.workspaceId },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, storageKey: true, kind: true },
    });
    if (!asset) throw new Error("Email asset not found.");
    const data = await readEmailAsset(asset.storageKey);
    if (data.byteLength !== asset.sizeBytes) throw new Error("Email asset size verification failed.");
    return { asset, data };
  }
}