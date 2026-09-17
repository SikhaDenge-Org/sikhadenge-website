import { KnowledgeStatus } from "@prisma/client";

import { prisma } from "../db/prisma";
import {
  cosineSimilarity,
  createKnowledgeEmbeddings,
  embeddingFromMetadata,
} from "../knowledge/embeddings";
import { searchConciseSalesReplies } from "./concise-sales-replies";
import { searchIndustrySalesHub } from "./industry-sales-reply-hub";
import { searchJobAssistanceReplies } from "./job-assistance-replies";
import { getAgentPolicy } from "./policy";
import { searchQuestionBankKnowledge } from "./question-bank";
import { searchSingleCourseReplies } from "./single-course-replies";
import { searchSkillFitReplies } from "./skill-fit-replies";
import type { AgentKnowledgeReference } from "./types";

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
  "i", "in", "is", "it", "me", "my", "of", "on", "or", "that", "the",
  "this", "to", "what", "when", "which", "with", "you", "your", "hai",
  "hain", "ka", "ke", "ki", "kya", "ko", "main", "mai", "mujhe", "aur",
  "se", "ye", "है", "का", "के", "की", "क्या", "को", "और", "से", "यह",
]);

const HIDDEN_STUDENT_PROGRAM =
  /AI Business Growth Architect|Business Growth Architect|growth architect program|business-focused program/iu;

function isStudentSafeReference(reference: AgentKnowledgeReference): boolean {
  return !HIDDEN_STUDENT_PROGRAM.test(
    `${reference.title} ${reference.heading ?? ""} ${reference.content}`,
  );
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLocaleLowerCase("en-IN")
        .match(/[\p{L}\p{N}]+/gu)
        ?.filter((token) => token.length > 1 && !STOP_WORDS.has(token)) ?? [],
    ),
  );
}

function lexicalScore(queryTokens: string[], value: string): number {
  if (queryTokens.length === 0) return 0;
  const normalized = value.toLocaleLowerCase("en-IN");
  let matched = 0;
  let weighted = 0;
  for (const token of queryTokens) {
    if (!normalized.includes(token)) continue;
    matched += 1;
    weighted += token.length >= 7 ? 1.25 : token.length >= 4 ? 1 : 0.75;
  }
  const coverage = matched / queryTokens.length;
  const density = Math.min(1, weighted / Math.max(4, queryTokens.length));
  return Math.min(1, coverage * 0.72 + density * 0.28);
}

function metadataModel(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const model = (metadata as Record<string, unknown>).embeddingModel;
  return typeof model === "string" ? model : null;
}

function mergeReferences(
  builtIn: AgentKnowledgeReference[],
  database: AgentKnowledgeReference[],
  limit: number,
): AgentKnowledgeReference[] {
  const seen = new Set<string>();
  return [...builtIn, ...database]
    .filter(isStudentSafeReference)
    .sort((left, right) => right.score - left.score)
    .filter((reference) => {
      const key = `${reference.documentId}:${reference.heading ?? ""}:${reference.content}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export async function retrieveApprovedKnowledge(
  query: string,
): Promise<AgentKnowledgeReference[]> {
  const policy = getAgentPolicy();
  const skillFit = searchSkillFitReplies(query).filter(isStudentSafeReference);
  const jobAssistance = searchJobAssistanceReplies(query).filter(isStudentSafeReference);
  const singleCourse = searchSingleCourseReplies(query).filter(isStudentSafeReference);
  const concise = searchConciseSalesReplies(query).filter(isStudentSafeReference);
  const industry = searchIndustrySalesHub(
    query,
    Math.min(2, policy.maximumKnowledgeChunks),
  ).filter(isStudentSafeReference);
  const standard = searchQuestionBankKnowledge(
    query,
    Math.min(2, policy.maximumKnowledgeChunks),
  ).filter(isStudentSafeReference);
  const builtIn = mergeReferences(
    [...skillFit, ...jobAssistance, ...singleCourse, ...concise, ...industry],
    standard,
    policy.maximumKnowledgeChunks,
  );
  const queryTokens = tokenize(query).slice(0, 24);
  if (queryTokens.length === 0) return builtIn;

  let queryEmbedding: { model: string; vector: number[] } | null = null;
  try {
    const generated = await createKnowledgeEmbeddings([query]);
    if (generated) {
      queryEmbedding = { model: generated.model, vector: generated.vectors[0] ?? [] };
    }
  } catch {
    queryEmbedding = null;
  }

  const now = new Date();
  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      document: {
        status: KnowledgeStatus.APPROVED,
        title: { not: "SikhaDenge Owned Question Bank" },
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
        ],
      },
    },
    select: {
      id: true,
      heading: true,
      content: true,
      metadata: true,
      document: {
        select: { id: true, title: true, category: true, version: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 400,
  });

  const database = chunks
    .filter(
      (chunk) =>
        !HIDDEN_STUDENT_PROGRAM.test(
          `${chunk.document.title} ${chunk.heading ?? ""} ${chunk.content}`,
        ),
    )
    .map((chunk) => {
      const titleScore = lexicalScore(queryTokens, chunk.document.title);
      const headingScore = lexicalScore(queryTokens, chunk.heading ?? "");
      const contentScore = lexicalScore(queryTokens, chunk.content);
      const lexical = Math.min(
        1,
        titleScore * 0.22 + headingScore * 0.28 + contentScore * 0.5,
      );

      const storedEmbedding = embeddingFromMetadata(chunk.metadata);
      const semantic =
        queryEmbedding &&
        storedEmbedding &&
        metadataModel(chunk.metadata) === queryEmbedding.model
          ? Math.max(0, cosineSimilarity(queryEmbedding.vector, storedEmbedding))
          : 0;
      const score = semantic > 0 ? lexical * 0.55 + semantic * 0.45 : lexical;

      return {
        chunkId: chunk.id,
        documentId: chunk.document.id,
        title: chunk.document.title,
        heading: chunk.heading,
        content: chunk.content,
        score: Number(Math.min(1, score).toFixed(4)),
      } satisfies AgentKnowledgeReference;
    })
    .filter((reference) => reference.score >= policy.knowledgeMinimumScore);

  return mergeReferences(
    builtIn,
    database,
    policy.maximumKnowledgeChunks,
  );
}
