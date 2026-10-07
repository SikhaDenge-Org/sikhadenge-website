import {
  LearningStatus,
  MessageActor,
  MessageDirection,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import { normalizeLearningText, redactLearningText } from "./redaction";

export type CustomerFeedbackSignal = "positive" | "negative";

const POSITIVE_FEEDBACK =
  /(?:thank\s*you|thanks|helpful|bahut\s+(?:achh|acch)|samajh\s+aa\s+gaya|clear\s+ho\s+gaya|sahi\s+bataya|perfect\s+reply|great\s+reply|exactly|bilkul\s+sahi)/iu;
const NEGATIVE_FEEDBACK =
  /(?:galat|wrong|sahi\s+nahi|aisa\s+nahi|samajh\s+nahi|clear\s+nahi|confus|irrelevant|repeat\s+kar|robot|bot\s+jaisa|same\s+question|bekar\s+reply)/iu;

const CORRECTION_PLACEHOLDER =
  "Human reviewer must write the corrected answer before this learning can be approved.";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function classifyCustomerFeedback(
  message: string,
): CustomerFeedbackSignal | null {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 1_000) return null;
  if (NEGATIVE_FEEDBACK.test(normalized)) return "negative";
  if (POSITIVE_FEEDBACK.test(normalized)) return "positive";
  return null;
}

export async function captureConversationFeedback(input: {
  sourceMessageId: string;
  userMessage: string;
}) {
  const signal = classifyCustomerFeedback(input.userMessage);
  if (!signal) return null;

  const source = await prisma.whatsAppMessage.findUnique({
    where: { id: input.sourceMessageId },
    select: {
      id: true,
      conversationId: true,
      messageTimestamp: true,
      direction: true,
      actor: true,
    },
  });
  if (
    !source ||
    source.direction !== MessageDirection.INBOUND ||
    source.actor !== MessageActor.CUSTOMER
  ) {
    return null;
  }

  const previousAnswer = await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId: source.conversationId,
      direction: MessageDirection.OUTBOUND,
      actor: MessageActor.AI,
      text: { not: null },
      messageTimestamp: { lt: source.messageTimestamp },
    },
    orderBy: { messageTimestamp: "desc" },
    select: { id: true, text: true, messageTimestamp: true },
  });
  if (!previousAnswer?.text?.trim()) return null;

  const previousQuestion = await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId: source.conversationId,
      direction: MessageDirection.INBOUND,
      actor: MessageActor.CUSTOMER,
      text: { not: null },
      messageTimestamp: { lt: previousAnswer.messageTimestamp },
    },
    orderBy: { messageTimestamp: "desc" },
    select: { text: true },
  });
  if (!previousQuestion?.text?.trim()) return null;

  const question = redactLearningText(previousQuestion.text);
  const answer = redactLearningText(previousAnswer.text);
  const feedback = redactLearningText(input.userMessage);
  const userQuestion = normalizeLearningText(question.text, 4_000);
  const originalAnswer = normalizeLearningText(answer.text, 4_000);
  const category =
    signal === "positive" ? "CUSTOMER_POSITIVE_FEEDBACK" : "CUSTOMER_CORRECTION";
  const proposedAnswer =
    signal === "positive" ? originalAnswer : CORRECTION_PLACEHOLDER;
  const correctionReason = normalizeLearningText(
    signal === "positive"
      ? "Customer explicitly indicated that the previous AI answer was useful or correct. Review before promoting it to approved knowledge."
      : `Customer indicated that the previous AI answer needs correction. Redacted feedback: ${feedback.text}`,
    2_000,
  );

  return prisma.$transaction(async (transaction) => {
    const duplicate = await transaction.learningSuggestion.findFirst({
      where: {
        status: LearningStatus.PENDING,
        sourceMessageId: source.id,
        category,
      },
      select: { id: true },
    });
    if (duplicate) return { suggestionId: duplicate.id, duplicate: true, signal };

    const suggestion = await transaction.learningSuggestion.create({
      data: {
        sourceMessageId: source.id,
        category,
        userQuestion,
        originalAnswer,
        proposedAnswer,
        correctionReason,
        redactedPayload: toJson({
          autoCaptured: signal === "negative",
          feedbackCaptured: true,
          feedbackSignal: signal,
          previousAiMessageId: previousAnswer.id,
          correctedAnswerRequired: signal === "negative",
          rawContentStored: false,
          redacted: {
            question: question.categories,
            originalAnswer: answer.categories,
            customerFeedback: feedback.categories,
          },
        }),
      },
      select: { id: true },
    });

    await transaction.auditLog.create({
      data: {
        action:
          signal === "positive"
            ? "LEARNING_POSITIVE_FEEDBACK_CAPTURED"
            : "LEARNING_CORRECTION_SIGNAL_CAPTURED",
        entityType: "LearningSuggestion",
        entityId: suggestion.id,
        after: toJson({
          category,
          sourceMessageId: source.id,
          previousAiMessageId: previousAnswer.id,
          feedbackSignal: signal,
          correctedAnswerRequired: signal === "negative",
          rawContentStored: false,
        }),
      },
    });

    return { suggestionId: suggestion.id, duplicate: false, signal };
  });
}
