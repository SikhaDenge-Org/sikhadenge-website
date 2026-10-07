import { prisma } from "../db/prisma";
import { checkSuppression } from "./consent-engine";
import { isAIHandlingAllowed } from "./takeover-engine";

export interface FollowUpSchedule {
  leadId: string;
  templateName: string;
  scheduledFor: Date;
  reason: string;
}

// Approved WhatsApp Follow-Up Templates
export const APPROVED_TEMPLATES = {
  MASTERCLASS_REMINDER: "masterclass_reminder_v1",
  FEE_QUERY_FOLLOWUP: "course_fee_followup_v1",
  COUNSELLOR_CALLBACK: "counsellor_callback_slot_v1",
  WORKSHOP_SEAT_CONFIRM: "workshop_seat_confirm_v1"
} as const;

/**
 * Calculates next follow-up delay based on lead temperature and intent.
 * HOT: 1 hour | WARM: 4 hours | COLD/NEW: 24 hours
 */
export function calculateFollowUpDelayHours(temperature: "HOT" | "WARM" | "COLD", isFeeInquiry: boolean): number {
  if (isFeeInquiry) return 2; // Fee inquiry warrants prompt followup
  switch (temperature) {
    case "HOT": return 1;
    case "WARM": return 4;
    case "COLD":
    default: return 24;
  }
}

/**
 * Cooldown Check: Ensures we do not send more than 1 automated follow-up within 24 hours.
 */
export async function isEligibleForFollowUp(phone: string, conversationId: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  // 1. Check opt-out / suppression
  const suppression = await checkSuppression(phone);
  if (suppression.isSuppressed) {
    return { eligible: false, reason: "USER_SUPPRESSED" };
  }

  // 2. Check human takeover gate
  const aiAllowed = await isAIHandlingAllowed(conversationId);
  if (!aiAllowed) {
    return { eligible: false, reason: "HUMAN_TAKEOVER_ACTIVE" };
  }

  // 3. Cooldown check: Last outbound message timestamp
  const lastOutbound = await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId,
      direction: "OUTBOUND"
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });

  if (lastOutbound) {
    const hoursSinceLastMessage = (Date.now() - lastOutbound.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastMessage < 24) {
      return { eligible: false, reason: "COOLDOWN_ACTIVE" };
    }
  }

  return { eligible: true };
}

/**
 * Schedules next follow-up on canonical Lead record.
 */
export async function scheduleNextFollowUp(params: {
  leadId: string;
  conversationId: string;
  phone: string;
  temperature: "HOT" | "WARM" | "COLD";
  isFeeInquiry: boolean;
  templateName: string;
}): Promise<FollowUpSchedule | null> {
  const eligibility = await isEligibleForFollowUp(params.phone, params.conversationId);
  if (!eligibility.eligible) {
    return null;
  }

  const delayHours = calculateFollowUpDelayHours(params.temperature, params.isFeeInquiry);
  const scheduledFor = new Date(Date.now() + delayHours * 60 * 60 * 1000);

  await prisma.lead.update({
    where: { id: params.leadId },
    data: { nextFollowUpAt: scheduledFor }
  });

  return {
    leadId: params.leadId,
    templateName: params.templateName,
    scheduledFor,
    reason: `Scheduled ${delayHours}h cadence for ${params.temperature} lead`
  };
}
