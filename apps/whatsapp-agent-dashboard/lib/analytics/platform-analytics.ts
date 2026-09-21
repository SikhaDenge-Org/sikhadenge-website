import {
  AgentMode,
  ConsentStatus,
  LeadStage,
  LeadTemperature,
  MessageDirection,
  MessageStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";

function record(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusCounter<T extends string>(values: T[], possible: readonly T[]) {
  return Object.fromEntries(possible.map((status) => [status, values.filter((value) => value === status).length]));
}

export async function getPlatformAnalytics() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
  const [
    contacts,
    conversations,
    messages,
    leads,
    campaignEvents,
    automationEvents,
    engagementEvents,
    lifecycleEvents,
  ] = await Promise.all([
    prisma.whatsAppContact.findMany({
      select: {
        id: true,
        consentStatus: true,
        optedOutAt: true,
        updatedAt: true,
        conversations: {
          orderBy: { lastMessageAt: "desc" },
          take: 1,
          select: {
            id: true,
            lastMessageAt: true,
            messages: {
              orderBy: { messageTimestamp: "desc" },
              take: 1,
              select: { direction: true, messageTimestamp: true },
            },
          },
        },
        lead: {
          select: {
            stage: true,
            temperature: true,
            score: true,
            nextFollowUpAt: true,
            interestedCourse: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.whatsAppConversation.findMany({
      select: {
        id: true,
        status: true,
        agentMode: true,
        unreadCount: true,
        assignedToId: true,
        lastMessageAt: true,
        humanTakeoverAt: true,
      },
    }),
    prisma.whatsAppMessage.findMany({
      where: { messageTimestamp: { gte: thirtyDaysAgo } },
      select: {
        direction: true,
        status: true,
        actor: true,
        type: true,
        messageTimestamp: true,
      },
    }),
    prisma.lead.findMany({
      select: {
        stage: true,
        temperature: true,
        score: true,
        assignedToId: true,
        qualifiedAt: true,
        closedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.webhookEvent.findMany({
      where: { eventType: "campaign_plan" },
      orderBy: { receivedAt: "desc" },
      take: 200,
      select: { payload: true, receivedAt: true },
    }),
    prisma.webhookEvent.findMany({
      where: { eventType: "automation_flow" },
      orderBy: { receivedAt: "desc" },
      take: 200,
      select: { payload: true, receivedAt: true },
    }),
    prisma.webhookEvent.findMany({
      where: {
        eventType: {
          in: [
            "engagement_form",
            "engagement_submission",
            "engagement_appointment",
            "engagement_payment",
          ],
        },
      },
      orderBy: { receivedAt: "desc" },
      take: 500,
      select: { eventType: true, payload: true, receivedAt: true },
    }),
    prisma.webhookEvent.findMany({
      where: { eventType: "agent_inbound_lifecycle", receivedAt: { gte: thirtyDaysAgo } },
      orderBy: { receivedAt: "desc" },
      take: 1_000,
      select: { payload: true, processingError: true, receivedAt: true },
    }),
  ]);

  const leadStages = statusCounter(
    leads.map((lead) => lead.stage),
    Object.values(LeadStage),
  );
  const leadTemperatures = statusCounter(
    leads.map((lead) => lead.temperature),
    Object.values(LeadTemperature),
  );
  const conversationModes = statusCounter(
    conversations.map((conversation) => conversation.agentMode),
    Object.values(AgentMode),
  );
  const messageStatuses = statusCounter(
    messages.filter((message) => message.direction === MessageDirection.OUTBOUND).map((message) => message.status),
    Object.values(MessageStatus),
  );

  const inboundMessages = messages.filter((message) => message.direction === MessageDirection.INBOUND).length;
  const outboundMessages = messages.filter((message) => message.direction === MessageDirection.OUTBOUND).length;
  const deliveryBase = Math.max(1, outboundMessages);
  const delivered = messageStatuses[MessageStatus.DELIVERED] || 0;
  const read = messageStatuses[MessageStatus.READ] || 0;
  const failed = messageStatuses[MessageStatus.FAILED] || 0;

  const campaignMetrics = campaignEvents.reduce(
    (totals, event) => {
      const payload = record(event.payload);
      totals.plans += 1;
      const status = String(payload.status || "").toUpperCase();
      if (status === "COMPLETED") totals.completed += 1;
      if (status === "SCHEDULED") totals.scheduled += 1;
      if (status === "PAUSED") totals.paused += 1;
      totals.audience += numberValue(payload.audienceTotal);
      totals.queued += numberValue(payload.queued);
      totals.failed += numberValue(payload.failed);
      return totals;
    },
    { plans: 0, completed: 0, scheduled: 0, paused: 0, audience: 0, queued: 0, failed: 0 },
  );

  const automationMetrics = automationEvents.reduce(
    (totals, event) => {
      const payload = record(event.payload);
      totals.flows += 1;
      const status = String(payload.status || "").toUpperCase();
      if (status === "ACTIVE") totals.active += 1;
      if (status === "PAUSED") totals.paused += 1;
      totals.runs += numberValue(payload.runCount);
      totals.failures += numberValue(payload.failureCount);
      return totals;
    },
    { flows: 0, active: 0, paused: 0, runs: 0, failures: 0 },
  );

  const engagementMetrics = engagementEvents.reduce(
    (totals, event) => {
      if (event.eventType === "engagement_form") totals.forms += 1;
      if (event.eventType === "engagement_submission") totals.submissions += 1;
      if (event.eventType === "engagement_appointment") {
        totals.appointments += 1;
        const payload = record(event.payload);
        if (String(payload.status || "").toUpperCase() === "COMPLETED") totals.completedAppointments += 1;
      }
      if (event.eventType === "engagement_payment") {
        totals.payments += 1;
        const payload = record(event.payload);
        if (String(payload.status || "").toUpperCase() === "PAID") {
          totals.paidMinor += numberValue(payload.amountMinor);
          totals.paidCount += 1;
        }
      }
      return totals;
    },
    { forms: 0, submissions: 0, appointments: 0, completedAppointments: 0, payments: 0, paidCount: 0, paidMinor: 0 },
  );

  const agentMetrics = lifecycleEvents.reduce(
    (totals, event) => {
      const payload = record(event.payload);
      if (payload.analyzed === true) totals.analyzed += 1;
      if (payload.queued === true) totals.queued += 1;
      if (payload.sent === true) totals.sent += 1;
      if (payload.handoff === true) totals.handoffs += 1;
      if (payload.failed === true || event.processingError) totals.failed += 1;
      return totals;
    },
    { analyzed: 0, queued: 0, sent: 0, handoffs: 0, failed: 0 },
  );

  const retargeting = contacts.reduce(
    (segments, contact) => {
      if (contact.consentStatus !== ConsentStatus.OPTED_IN || contact.optedOutAt) {
        segments.suppressed += 1;
        return segments;
      }
      const lead = contact.lead;
      const latestConversation = contact.conversations[0];
      const latestMessage = latestConversation?.messages[0];
      if (lead?.temperature === LeadTemperature.HOT && lead.stage !== LeadStage.ENROLLED) {
        segments.hotLeads += 1;
      }
      if (lead?.stage === LeadStage.DEMO_BOOKED) segments.demoNotEnrolled += 1;
      if (lead?.stage === LeadStage.PAYMENT_PENDING) segments.paymentPending += 1;
      if (lead?.nextFollowUpAt && lead.nextFollowUpAt <= now) segments.followUpDue += 1;
      if (
        latestMessage?.direction === MessageDirection.OUTBOUND &&
        latestMessage.messageTimestamp <= sevenDaysAgo
      ) {
        segments.noReplySevenDays += 1;
      }
      if (!latestConversation?.lastMessageAt || latestConversation.lastMessageAt <= thirtyDaysAgo) {
        segments.inactiveThirtyDays += 1;
      }
      return segments;
    },
    {
      hotLeads: 0,
      demoNotEnrolled: 0,
      paymentPending: 0,
      followUpDue: 0,
      noReplySevenDays: 0,
      inactiveThirtyDays: 0,
      suppressed: 0,
    },
  );

  const daily = Array.from({ length: 30 }, (_, index) => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (29 - index));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1_000);
    return {
      date: start.toISOString().slice(0, 10),
      inbound: messages.filter(
        (message) =>
          message.direction === MessageDirection.INBOUND &&
          message.messageTimestamp >= start &&
          message.messageTimestamp < end,
      ).length,
      outbound: messages.filter(
        (message) =>
          message.direction === MessageDirection.OUTBOUND &&
          message.messageTimestamp >= start &&
          message.messageTimestamp < end,
      ).length,
      leads: leads.filter((lead) => lead.createdAt >= start && lead.createdAt < end).length,
    };
  });

  return {
    generatedAt: now.toISOString(),
    periodDays: 30,
    totals: {
      contacts: contacts.length,
      optedIn: contacts.filter((contact) => contact.consentStatus === ConsentStatus.OPTED_IN).length,
      optedOut: contacts.filter((contact) => contact.consentStatus === ConsentStatus.OPTED_OUT).length,
      conversations: conversations.length,
      openConversations: conversations.filter((conversation) => ["OPEN", "WAITING"].includes(conversation.status)).length,
      unread: conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
      unassigned: conversations.filter((conversation) => !conversation.assignedToId).length,
      leads: leads.length,
      averageLeadScore: leads.length ? Math.round(leads.reduce((sum, lead) => sum + lead.score, 0) / leads.length) : 0,
      inboundMessages,
      outboundMessages,
    },
    leadStages,
    leadTemperatures,
    conversationModes,
    messageStatuses,
    delivery: {
      deliveredRate: Number(((delivered / deliveryBase) * 100).toFixed(1)),
      readRate: Number(((read / deliveryBase) * 100).toFixed(1)),
      failureRate: Number(((failed / deliveryBase) * 100).toFixed(1)),
    },
    campaigns: campaignMetrics,
    automation: automationMetrics,
    engagement: engagementMetrics,
    agent: agentMetrics,
    retargeting,
    daily,
  };
}
