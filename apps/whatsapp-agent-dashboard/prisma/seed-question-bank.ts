import { KnowledgeStatus, Prisma, PrismaClient } from "@prisma/client";

import {
  QUESTION_BANK_DEFINITIONS,
  QUESTION_BANK_VARIANT_COUNT,
  questionBankVariants,
  renderQuestionBankAnswer,
} from "../lib/agent/question-bank";
import { knowledgeChecksum } from "../lib/knowledge/text-processing";

const prisma = new PrismaClient();
const TITLE = "SikhaDenge Owned Question Bank";
const CATEGORY = "FAQ_QUESTION_BANK";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function main() {
  const latest = await prisma.knowledgeDocument.findFirst({
    where: { title: TITLE, category: CATEGORY },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  await prisma.knowledgeDocument.updateMany({
    where: {
      title: TITLE,
      category: CATEGORY,
      status: KnowledgeStatus.APPROVED,
    },
    data: { status: KnowledgeStatus.ARCHIVED },
  });

  const document = await prisma.knowledgeDocument.create({
    data: {
      title: TITLE,
      category: CATEGORY,
      sourceType: "SYSTEM_SEEDED_OWNED_QA",
      version: (latest?.version ?? 0) + 1,
      status: KnowledgeStatus.APPROVED,
      approvedAt: new Date(),
      chunks: {
        create: QUESTION_BANK_DEFINITIONS.map((definition, index) => {
          const hinglishAnswer = renderQuestionBankAnswer(definition, "hinglish");
          const englishAnswer = renderQuestionBankAnswer(definition, "en");
          const variants = questionBankVariants(definition);
          const content = hinglishAnswer;

          return {
            heading: definition.questions[0],
            content,
            checksum: knowledgeChecksum(`${definition.id}\n${content}`),
            metadata: toJson({
              questionBankId: definition.id,
              ordinal: index,
              category: definition.category,
              intent: definition.intent,
              keywords: definition.keywords,
              englishAnswer,
              questionVariants: variants,
              variantCount: variants.length,
              source: "sikhadenge-owned-question-bank-v1",
              customerFacingContentOnly: true,
            }),
          };
        }),
      },
    },
    select: {
      id: true,
      version: true,
      _count: { select: { chunks: true } },
    },
  });

  console.log(
    `Question bank seeded: ${document._count.chunks} answer definitions, ${QUESTION_BANK_VARIANT_COUNT} question variants, version ${document.version}, document ${document.id}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
