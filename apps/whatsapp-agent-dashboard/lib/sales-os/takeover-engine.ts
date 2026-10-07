import { prisma } from "../db/prisma";

export interface TakeoverResult {
  success: boolean;
  conversationId: string;
  agentMode: "AI" | "HUMAN";
  humanTakeoverAt: Date | null;
  humanTakeoverReason: string | null;
}

/**
 * Switches a conversation to HUMAN mode and silences AI automation.
 */
export async function enableHumanTakeover(params: {
  conversationId: string;
  userId?: string | null;
  reason?: string;
}): Promise<TakeoverResult> {
  const updated = await prisma.whatsAppConversation.update({
    where: { id: params.conversationId },
    data: {
      agentMode: "HUMAN",
      humanTakeoverAt: new Date(),
      humanTakeoverReason: params.reason || "Manual counsellor takeover",
      ...(params.userId ? { assignedToId: params.userId } : {})
    },
    select: {
      id: true,
      agentMode: true,
      humanTakeoverAt: true,
      humanTakeoverReason: true
    }
  });

  return {
    success: true,
    conversationId: updated.id,
    agentMode: updated.agentMode as "AI" | "HUMAN",
    humanTakeoverAt: updated.humanTakeoverAt,
    humanTakeoverReason: updated.humanTakeoverReason
  };
}

/**
 * Returns a conversation back to AI automation mode.
 */
export async function releaseToAIAgent(conversationId: string): Promise<TakeoverResult> {
  const updated = await prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: {
      agentMode: "AI",
      humanTakeoverAt: null,
      humanTakeoverReason: null
    },
    select: {
      id: true,
      agentMode: true,
      humanTakeoverAt: true,
      humanTakeoverReason: true
    }
  });

  return {
    success: true,
    conversationId: updated.id,
    agentMode: updated.agentMode as "AI" | "HUMAN",
    humanTakeoverAt: null,
    humanTakeoverReason: null
  };
}

/**
 * Checks if a conversation is allowed to be handled by AI.
 * Returns false if human takeover is active.
 */
export async function isAIHandlingAllowed(conversationId: string): Promise<boolean> {
  const conv = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    select: { agentMode: true }
  });

  return conv?.agentMode === "AI";
}
