import { AgentMode, DashboardRole, MessageStatus, TemplateStatus } from "@prisma/client";

import { prisma } from "../db/prisma";
import { getOutboundMode } from "../meta/outbound-client";

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function configuredAny(...names: string[]): boolean {
  return names.some((name) => configured(name));
}

function enabled(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on", "enabled", "live"].includes(value)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  return fallback;
}

export async function getCutoverReadiness() {
  const [
    approvedTemplates,
    queuedMessages,
    failedMessages,
    reviewRequired,
    activeAdmins,
    webhookMessages,
    webhookStatuses,
    pendingCampaigns,
    activeAutomationFlows,
    latestInbound,
  ] = await Promise.all([
    prisma.whatsAppTemplate.count({ where: { status: TemplateStatus.APPROVED } }),
    prisma.whatsAppMessage.count({ where: { status: MessageStatus.QUEUED } }),
    prisma.whatsAppMessage.count({ where: { status: MessageStatus.FAILED } }),
    prisma.whatsAppConversation.count({ where: { agentMode: AgentMode.REVIEW_REQUIRED } }),
    prisma.dashboardUser.count({ where: { role: DashboardRole.ADMIN, isActive: true } }),
    prisma.webhookEvent.count({ where: { eventType: "message", processingError: null } }),
    prisma.webhookEvent.count({ where: { eventType: "status", processingError: null } }),
    prisma.webhookEvent.count({ where: { eventType: "campaign_plan", processedAt: null } }),
    prisma.webhookEvent.count({ where: { eventType: "automation_flow", processingError: null } }),
    prisma.webhookEvent.findFirst({
      where: { eventType: "message", processingError: null },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    }),
  ]);

  const wabaConfigured = configuredAny(
    "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "META_WHATSAPP_BUSINESS_ACCOUNT_ID",
    "META_WABA_ID",
  );
  const phoneConfigured = configuredAny(
    "WHATSAPP_PHONE_NUMBER_ID",
    "META_WHATSAPP_PHONE_NUMBER_ID",
  );
  const tokenConfigured = configuredAny(
    "WHATSAPP_ACCESS_TOKEN",
    "META_WHATSAPP_ACCESS_TOKEN",
  );
  const graphConfigured = configuredAny(
    "WHATSAPP_GRAPH_VERSION",
    "META_GRAPH_API_VERSION",
  );
  const signatureConfigured =
    configured("WHATSAPP_APP_SECRET") && configured("WHATSAPP_VERIFY_TOKEN");
  const effectiveOutboundMode = getOutboundMode();
  const migrationEvidence =
    wabaConfigured &&
    phoneConfigured &&
    tokenConfigured &&
    signatureConfigured &&
    webhookMessages > 0;
  const aiAutoReplyEnabled =
    enabled("AGENT_AUTO_REPLY_ENABLED") && enabled("AGENT_IMMEDIATE_DISPATCH_ENABLED");

  const checks = [
    {
      id: "waba",
      group: "Meta account",
      label: "WABA ID configured",
      status: wabaConfigured ? "PASS" : "BLOCKED",
      detail: "Business account identifier is stored in the environment.",
    },
    {
      id: "phone",
      group: "Meta account",
      label: "Phone Number ID configured",
      status: phoneConfigured ? "PASS" : "BLOCKED",
      detail: "Production phone-number identifier is stored in the environment.",
    },
    {
      id: "token",
      group: "Meta account",
      label: "System-user access token configured",
      status: tokenConfigured ? "PASS" : "BLOCKED",
      detail: "Token value is never displayed by the dashboard.",
    },
    {
      id: "graph",
      group: "Meta account",
      label: "Graph API version configured",
      status: graphConfigured ? "PASS" : "BLOCKED",
      detail: "Production Meta requests use the configured Graph API version.",
    },
    {
      id: "signature",
      group: "Webhooks",
      label: "App secret and verify token configured",
      status: signatureConfigured ? "PASS" : "BLOCKED",
      detail: "Webhook verification and signature validation are available.",
    },
    {
      id: "subscription",
      group: "Webhooks",
      label: "WABA app subscription",
      status: webhookMessages > 0 ? "PASS" : wabaConfigured ? "MANUAL" : "BLOCKED",
      detail: webhookMessages > 0
        ? "Production message webhooks are reaching the owned dashboard."
        : "Subscribe the production app and send one inbound test message.",
    },
    {
      id: "inbound",
      group: "Webhooks",
      label: "Real inbound webhook evidence",
      status: webhookMessages > 0 ? "PASS" : "PENDING",
      detail: `${webhookMessages} inbound message event(s) and ${webhookStatuses} status event(s) stored.${latestInbound ? ` Latest inbound: ${latestInbound.receivedAt.toISOString()}.` : ""}`,
    },
    {
      id: "registration",
      group: "Phone migration",
      label: "Phone registered on owned Cloud API",
      status: migrationEvidence ? "PASS" : "MANUAL",
      detail: migrationEvidence
        ? "Owned credentials and production inbound traffic confirm the migrated number is active."
        : "Complete verification, registration and a production inbound smoke test.",
    },
    {
      id: "aisensy",
      group: "Provider ownership",
      label: "Owned dashboard receives production traffic",
      status: migrationEvidence ? "PASS" : "MANUAL",
      detail: migrationEvidence
        ? "Production traffic is being processed by the SikhaDenge-owned webhook."
        : "Keep the previous provider available until owned webhook evidence is stored.",
    },
    {
      id: "templates",
      group: "Messaging",
      label: "Approved fallback templates",
      status: approvedTemplates > 0 ? "PASS" : "PENDING",
      detail: `${approvedTemplates} Meta-approved template(s) available.`,
    },
    {
      id: "outbound-mode",
      group: "Messaging",
      label: "Manual outbound delivery mode",
      status: effectiveOutboundMode === "live" ? "PASS" : "PENDING",
      detail: `Effective outbound mode: ${effectiveOutboundMode}.`,
    },
    {
      id: "ai-reply",
      group: "Messaging",
      label: "AI automatic reply runtime",
      status: aiAutoReplyEnabled && effectiveOutboundMode === "live" ? "PASS" : "PENDING",
      detail: aiAutoReplyEnabled
        ? "AI auto-reply and immediate dispatch are enabled."
        : "Enable AI auto-reply only after manual outbound smoke testing passes.",
    },
    {
      id: "bulk-lock",
      group: "Messaging",
      label: "Campaign and automation safeguards",
      status:
        !enabled("WHATSAPP_CAMPAIGNS_ENABLED") &&
        !enabled("AUTOMATION_ACTIONS_ENABLED") &&
        !enabled("INTEGRATION_EXTERNAL_WRITES_ENABLED")
          ? "PASS"
          : "MANUAL",
      detail: "Bulk and external writes should remain controlled until individual messaging is stable.",
    },
    {
      id: "queue",
      group: "Operations",
      label: "Outbound queue reviewed",
      status: queuedMessages === 0 ? "PASS" : "PENDING",
      detail: `${queuedMessages} queued message(s); ${failedMessages} historical failed message(s).`,
    },
    {
      id: "review",
      group: "Operations",
      label: "Human review queue understood",
      status: "PASS",
      detail: `${reviewRequired} conversation(s) currently require review.`,
    },
    {
      id: "admins",
      group: "Access",
      label: "Active administrator access",
      status: activeAdmins > 0 ? "PASS" : "BLOCKED",
      detail: `${activeAdmins} active administrator account(s).`,
    },
  ] as const;

  const blocked = checks.filter((check) => check.status === "BLOCKED").length;
  const pending = checks.filter((check) => check.status === "PENDING").length;
  const manual = checks.filter((check) => check.status === "MANUAL").length;
  const passed = checks.filter((check) => check.status === "PASS").length;

  return {
    readyForSupervisedCutover: blocked === 0,
    readyForAutomaticCutover:
      migrationEvidence && effectiveOutboundMode === "live" && blocked === 0,
    cutoverExecuted: migrationEvidence,
    metaConnected: migrationEvidence,
    outboundMode: effectiveOutboundMode,
    checks,
    summary: { passed, pending, manual, blocked },
    inventory: {
      approvedTemplates,
      queuedMessages,
      failedMessages,
      reviewRequired,
      activeAdmins,
      webhookMessages,
      webhookStatuses,
      pendingCampaigns,
      activeAutomationFlows,
    },
    constraints: {
      aiSensyStillOwnsLiveTraffic: !migrationEvidence,
      outboundMustRemainDisabled: !migrationEvidence,
      otpMustRemainPrivate: true,
      twoStepPinMustRemainPrivate: true,
      externalChangesRequireExplicitApproval: true,
    },
    generatedAt: new Date().toISOString(),
  };
}
