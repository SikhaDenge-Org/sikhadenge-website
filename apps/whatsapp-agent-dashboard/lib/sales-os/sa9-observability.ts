import { prisma } from "../db/prisma";
import { checkSuppression } from "./consent-engine";
import { isAIHandlingAllowed } from "./takeover-engine";

export interface OutboundPolicyAudit {
  allowed: boolean;
  reasonCode: "ALLOWED" | "SUPPRESSED_USER" | "HUMAN_TAKEOVER_ACTIVE" | "WINDOW_EXPIRED" | "INVALID_PHONE";
  evidence: Record<string, unknown>;
  evaluatedAt: Date;
}

export interface SalesEngineHealthSummary {
  timestamp: Date;
  totalContacts: number;
  suppressedContacts: number;
  activeConversations: number;
  conversationsByMode: {
    ai: number;
    human: number;
  };
  leadsByTemperature: {
    hot: number;
    warm: number;
    cold: number;
  };
  convertedLeadsCount: number;
}

/**
 * Strict Fail-Closed Policy Gate: Evaluates all pre-conditions before automated outbound send.
 */
export async function auditOutboundPolicyGate(params: {
  phone: string;
  conversationId: string;
}): Promise<OutboundPolicyAudit> {
  const evaluatedAt = new Date();
  const cleanPhone = params.phone.replace(/\D/g, "");

  if (!cleanPhone || cleanPhone.length < 10) {
    return {
      allowed: false,
      reasonCode: "INVALID_PHONE",
      evidence: { phone: params.phone },
      evaluatedAt
    };
  }

  // 1. Suppression / Opt-out check
  const suppression = await checkSuppression(cleanPhone);
  if (suppression.isSuppressed) {
    return {
      allowed: false,
      reasonCode: "SUPPRESSED_USER",
      evidence: { reason: suppression.reason },
      evaluatedAt
    };
  }

  // 2. Human Takeover check
  const aiAllowed = await isAIHandlingAllowed(params.conversationId);
  if (!aiAllowed) {
    return {
      allowed: false,
      reasonCode: "HUMAN_TAKEOVER_ACTIVE",
      evidence: { conversationId: params.conversationId },
      evaluatedAt
    };
  }

  // 3. 24-Hour WhatsApp Service Window Check
  const conv = await prisma.whatsAppConversation.findUnique({
    where: { id: params.conversationId },
    select: { serviceWindowExpiresAt: true, lastMessageAt: true }
  });

  const windowExpiresAt = conv?.serviceWindowExpiresAt;
  const isWindowActive = windowExpiresAt ? windowExpiresAt.getTime() > Date.now() : true;

  if (!isWindowActive) {
    return {
      allowed: false,
      reasonCode: "WINDOW_EXPIRED",
      evidence: { serviceWindowExpiresAt: windowExpiresAt },
      evaluatedAt
    };
  }

  return {
    allowed: true,
    reasonCode: "ALLOWED",
    evidence: { cleanPhone, conversationId: params.conversationId },
    evaluatedAt
  };
}

/**
 * Live Health Metrics Engine: Gathers diagnostic counts across conversations and leads.
 */
export async function getSalesEngineHealth(): Promise<SalesEngineHealthSummary> {
  const [totalContacts, suppressedContacts, openConversations, leads] = await Promise.all([
    prisma.whatsAppContact.count(),
    prisma.whatsAppContact.count({
      where: {
        OR: [
          { optedOutAt: { not: null } },
          { consentStatus: "OPTED_OUT" }
        ]
      }
    }),
    prisma.whatsAppConversation.findMany({
      where: { status: "OPEN" },
      select: { agentMode: true }
    }),
    prisma.lead.findMany({
      select: { temperature: true, closedAt: true }
    })
  ]);

  const aiModeCount = openConversations.filter(c => c.agentMode === "AI").length;
  const humanModeCount = openConversations.filter(c => c.agentMode === "HUMAN").length;

  const hotCount = leads.filter(l => l.temperature === "HOT").length;
  const warmCount = leads.filter(l => l.temperature === "WARM").length;
  const coldCount = leads.filter(l => l.temperature === "COLD").length;
  const convertedCount = leads.filter(l => l.closedAt !== null).length;

  return {
    timestamp: new Date(),
    totalContacts,
    suppressedContacts,
    activeConversations: openConversations.length,
    conversationsByMode: {
      ai: aiModeCount,
      human: humanModeCount
    },
    leadsByTemperature: {
      hot: hotCount,
      warm: warmCount,
      cold: coldCount
    },
    convertedLeadsCount: convertedCount
  };
}
