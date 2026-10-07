import { prisma } from "../db/prisma";

export type NextActionRecommendation = 
  | "CALL_IMMEDIATELY"
  | "SEND_FEE_BREAKDOWN"
  | "OFFER_WORKSHOP_PASS"
  | "SCHEDULE_FOLLOWUP";

export interface PriorityScoreResult {
  priorityScore: number;
  slaMinutes: number;
  isUrgent: boolean;
}

/**
 * Calculates priority weight and SLA target based on lead signals.
 */
export function calculateLeadPriority(params: {
  temperature: "HOT" | "WARM" | "COLD";
  score: number;
  counselorRequested: boolean;
  feeUnderstood: boolean;
}): PriorityScoreResult {
  let priority = params.score;

  if (params.counselorRequested) priority += 50;
  if (params.temperature === "HOT") priority += 30;
  if (params.temperature === "WARM") priority += 15;
  if (!params.feeUnderstood) priority += 10;

  const isUrgent = priority >= 80 || params.counselorRequested;
  const slaMinutes = isUrgent ? 15 : params.temperature === "WARM" ? 60 : 240;

  return {
    priorityScore: priority,
    slaMinutes,
    isUrgent
  };
}

/**
 * Determines the Next-Best-Action for the counsellor.
 */
export function determineNextBestAction(params: {
  temperature: "HOT" | "WARM" | "COLD";
  counselorRequested: boolean;
  feeUnderstood: boolean;
  score: number;
}): NextActionRecommendation {
  if (params.counselorRequested || params.temperature === "HOT") {
    return "CALL_IMMEDIATELY";
  }
  if (!params.feeUnderstood) {
    return "SEND_FEE_BREAKDOWN";
  }
  if (params.score >= 40) {
    return "OFFER_WORKSHOP_PASS";
  }
  return "SCHEDULE_FOLLOWUP";
}

/**
 * Assigns lead and conversation to a counsellor.
 */
export async function assignCounsellor(params: {
  leadId: string;
  conversationId: string;
  counsellorId: string;
}) {
  const [updatedLead, updatedConv] = await prisma.$transaction([
    prisma.lead.update({
      where: { id: params.leadId },
      data: { assignedToId: params.counsellorId }
    }),
    prisma.whatsAppConversation.update({
      where: { id: params.conversationId },
      data: { assignedToId: params.counsellorId }
    })
  ]);

  return {
    leadId: updatedLead.id,
    conversationId: updatedConv.id,
    counsellorId: params.counsellorId
  };
}

/**
 * Evaluates SLA status for an active lead.
 */
export function checkSLABreach(createdAt: Date, slaMinutes: number): {
  isBreached: boolean;
  elapsedMinutes: number;
} {
  const elapsedMinutes = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60));
  return {
    isBreached: elapsedMinutes > slaMinutes,
    elapsedMinutes
  };
}
