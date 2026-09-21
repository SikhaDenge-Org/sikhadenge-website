import { DashboardRole, KnowledgeStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { QUESTION_BANK_DEFINITIONS } from "../../../../lib/agent/question-bank";
import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { prisma } from "../../../../lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

const HIDDEN_STUDENT_PROGRAM =
  /AI Business Growth Architect|Business Growth Architect|growth architect program|business-focused program/iu;
const COURSE_CHOICE_QUESTION =
  /which\s+(?:course|program)|kis\s+course|kaunsa\s+course|konsa\s+course|course\s+ka\s+naam/iu;

function masterclassLink(): string {
  return process.env.SIKHADENGE_MASTERCLASS_URL?.trim() || "DEMO";
}

function cleanText(value: string): string {
  return value.replaceAll("{{MASTERCLASS_LINK}}", masterclassLink()).trim();
}

function safeNextQuestion(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = cleanText(value);
  if (COURSE_CHOICE_QUESTION.test(cleaned)) return null;
  if (HIDDEN_STUDENT_PROGRAM.test(cleaned)) return null;
  return cleaned;
}

export async function GET() {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  const builtIn = QUESTION_BANK_DEFINITIONS.filter((entry) => {
    const combined = [
      entry.id,
      entry.category,
      ...entry.questions,
      ...entry.keywords,
      entry.answer.en,
      entry.answer.hinglish,
      entry.nextQuestion?.en || "",
      entry.nextQuestion?.hinglish || "",
    ].join(" ");
    return !HIDDEN_STUDENT_PROGRAM.test(combined);
  }).map((entry) => ({
    id: `built-in:${entry.id}`,
    source: "BUILT_IN" as const,
    category: entry.category,
    intent: entry.intent,
    questions: [...entry.questions],
    keywords: [...entry.keywords],
    answer: {
      en: cleanText(entry.answer.en),
      hinglish: cleanText(entry.answer.hinglish),
    },
    nextQuestion: {
      en: safeNextQuestion(entry.nextQuestion?.en),
      hinglish: safeNextQuestion(entry.nextQuestion?.hinglish),
    },
    status: "ACTIVE" as const,
    updatedAt: null,
  }));

  const approvedChunks = await prisma.knowledgeChunk.findMany({
    where: {
      document: {
        status: KnowledgeStatus.APPROVED,
        sourceType: "HUMAN_APPROVED_LEARNING",
      },
    },
    select: {
      id: true,
      heading: true,
      content: true,
      updatedAt: true,
      document: {
        select: {
          category: true,
          title: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const custom = approvedChunks
    .filter(
      (chunk) =>
        !HIDDEN_STUDENT_PROGRAM.test(
          `${chunk.heading || ""} ${chunk.content} ${chunk.document.title}`,
        ),
    )
    .map((chunk) => ({
      id: `custom:${chunk.id}`,
      source: "CUSTOM_APPROVED" as const,
      category: chunk.document.category,
      intent: "CUSTOM",
      questions: [chunk.heading || "Approved custom question"],
      keywords: [],
      answer: {
        en: chunk.content,
        hinglish: chunk.content,
      },
      nextQuestion: { en: null, hinglish: null },
      status: "ACTIVE" as const,
      updatedAt: chunk.updatedAt.toISOString(),
    }));

  return NextResponse.json(
    {
      entries: [...custom, ...builtIn],
      summary: {
        total: custom.length + builtIn.length,
        builtIn: builtIn.length,
        customApproved: custom.length,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
