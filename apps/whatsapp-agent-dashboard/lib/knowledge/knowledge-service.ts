import { KnowledgeStatus, Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";
import { createKnowledgeEmbeddings } from "./embeddings";
import {
  knowledgeChecksum,
  normalizeKnowledgeText,
  prepareKnowledgeChunks,
} from "./text-processing";

export type KnowledgeDocumentInput = {
  title: string;
  category: string;
  sourceType: string;
  sourceUrl?: string | null;
  content: string;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  actorId: string;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function cleanRequired(value: string, field: string, maximum: number): string {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) throw new Error(`${field} is required.`);
  if (cleaned.length > maximum) throw new Error(`${field} is too long.`);
  return cleaned;
}

export async function ingestKnowledgeDocument(input: KnowledgeDocumentInput) {
  const title = cleanRequired(input.title, "Title", 200);
  const category = cleanRequired(input.category, "Category", 100);
  const sourceType = cleanRequired(input.sourceType, "Source type", 80);
  const sourceUrl = input.sourceUrl?.trim() || null;
  const content = normalizeKnowledgeText(input.content);

  if (content.length < 20) throw new Error("Knowledge content is too short.");
  if (content.length > 300_000) {
    throw new Error("Knowledge content exceeds 300,000 characters.");
  }
  if (input.effectiveFrom && input.effectiveTo && input.effectiveFrom >= input.effectiveTo) {
    throw new Error("Effective-to date must be after effective-from date.");
  }

  const chunks = prepareKnowledgeChunks(content);
  if (chunks.length === 0) throw new Error("No usable knowledge chunks were produced.");
  if (chunks.length > 500) throw new Error("Knowledge document produced too many chunks.");

  const sourceChecksum = knowledgeChecksum(content);
  let embeddingResult: Awaited<ReturnType<typeof createKnowledgeEmbeddings>> = null;
  let embeddingError: string | null = null;

  try {
    embeddingResult = await createKnowledgeEmbeddings(
      chunks.map((chunk) =>
        [title, chunk.heading, chunk.content].filter(Boolean).join("\n"),
      ),
    );
  } catch (error) {
    embeddingError = error instanceof Error ? error.message.slice(0, 500) : "Embedding failed.";
    if (process.env.KNOWLEDGE_EMBEDDINGS_REQUIRED === "true") throw error;
  }

  return prisma.$transaction(async (transaction) => {
    const latest = await transaction.knowledgeDocument.findFirst({
      where: { title, category },
      orderBy: { version: "desc" },
      select: { id: true, version: true, status: true },
    });

    const duplicate = await transaction.knowledgeChunk.findFirst({
      where: {
        document: { title, category },
        metadata: { path: ["sourceChecksum"], equals: sourceChecksum },
      },
      select: { documentId: true },
    });
    if (duplicate) {
      throw new Error("An identical version of this knowledge document already exists.");
    }

    const document = await transaction.knowledgeDocument.create({
      data: {
        title,
        category,
        sourceType,
        sourceUrl,
        version: (latest?.version ?? 0) + 1,
        status: KnowledgeStatus.IN_REVIEW,
        effectiveFrom: input.effectiveFrom ?? null,
        effectiveTo: input.effectiveTo ?? null,
        chunks: {
          create: chunks.map((chunk, index) => ({
            heading: chunk.heading,
            content: chunk.content,
            checksum: chunk.checksum,
            metadata: toJson({
              ...chunk.metadata,
              ...(embeddingResult
                ? {
                    embedding: embeddingResult.vectors[index],
                    embeddingModel: embeddingResult.model,
                    embeddingStatus: "READY",
                  }
                : {
                    embeddingStatus: "UNAVAILABLE",
                    embeddingError,
                  }),
            }),
          })),
        },
      },
      include: { _count: { select: { chunks: true } } },
    });

    await transaction.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "KNOWLEDGE_DOCUMENT_INGESTED",
        entityType: "KnowledgeDocument",
        entityId: document.id,
        after: toJson({
          title: document.title,
          category: document.category,
          version: document.version,
          status: document.status,
          sourceType: document.sourceType,
          sourceChecksum,
          chunkCount: document._count.chunks,
          previousVersionId: latest?.id ?? null,
          embeddingModel: embeddingResult?.model ?? null,
          embeddingStatus: embeddingResult ? "READY" : "UNAVAILABLE",
        }),
      },
    });

    return document;
  });
}

export async function listKnowledgeDocuments(limit = 100) {
  return prisma.knowledgeDocument.findMany({
    orderBy: [{ updatedAt: "desc" }, { version: "desc" }],
    take: Math.max(1, Math.min(250, limit)),
    select: {
      id: true,
      title: true,
      category: true,
      sourceType: true,
      sourceUrl: true,
      version: true,
      status: true,
      effectiveFrom: true,
      effectiveTo: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { chunks: true } },
    },
  });
}

export async function reviewKnowledgeDocument(input: {
  documentId: string;
  action: "APPROVE" | "REJECT" | "ARCHIVE";
  actorId: string;
  reason?: string | null;
}) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.knowledgeDocument.findUnique({
      where: { id: input.documentId },
      select: {
        id: true,
        title: true,
        category: true,
        version: true,
        status: true,
      },
    });
    if (!existing) throw new Error("Knowledge document not found.");

    const nextStatus =
      input.action === "APPROVE"
        ? KnowledgeStatus.APPROVED
        : input.action === "REJECT"
          ? KnowledgeStatus.REJECTED
          : KnowledgeStatus.ARCHIVED;

    if (input.action === "APPROVE") {
      await transaction.knowledgeDocument.updateMany({
        where: {
          id: { not: existing.id },
          title: existing.title,
          category: existing.category,
          status: KnowledgeStatus.APPROVED,
        },
        data: { status: KnowledgeStatus.ARCHIVED },
      });
    }

    const updated = await transaction.knowledgeDocument.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        approvedAt: input.action === "APPROVE" ? new Date() : null,
      },
      select: {
        id: true,
        title: true,
        category: true,
        version: true,
        status: true,
        approvedAt: true,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorId: input.actorId,
        action: `KNOWLEDGE_DOCUMENT_${input.action}`,
        entityType: "KnowledgeDocument",
        entityId: existing.id,
        before: toJson({ status: existing.status }),
        after: toJson({
          status: updated.status,
          reason: input.reason?.trim().slice(0, 1_000) || null,
        }),
      },
    });
    return updated;
  });
}
