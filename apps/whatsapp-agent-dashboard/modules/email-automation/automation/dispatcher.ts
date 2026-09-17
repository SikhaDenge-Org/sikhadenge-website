import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { listAutomationFlows } from "@/lib/automation/automation-service";
import { ManualEmailSendService } from "../application/manual-send-service";
import { getEmailRuntimePolicy } from "../application/runtime-policy";
import { buildEmailAutomationIdempotencyKey } from "./contracts";
import { enqueueEmailAutomationEvent } from "./event-outbox";
import { emailAutomationConditionPasses, emailAutomationContactContext, executeEmailAutomationCrmAction } from "./action-executor";
import { createEmailUnsubscribeUrl } from "../campaigns/unsubscribe";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function primitiveVariables(payload: unknown): Record<string, string> {
  const source = record(payload);
  return Object.fromEntries(
    Object.entries(source)
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
      .map(([key, value]) => [key, String(value)]),
  );
}

function compactIdempotencyKey(raw: string): string {
  return `email:auto:${createHash("sha256").update(raw).digest("hex")}`;
}

function relatedTriggers(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function automationPolicyReady(): { ready: boolean; reason: string | null } {
  const policy = getEmailRuntimePolicy();
  if (!policy.runtimeEnabled) return { ready: false, reason: "Email runtime is disabled." };
  if (!policy.automationEnabled) return { ready: false, reason: "Email automation is disabled." };
  if (
    policy.mode !== "DRY_RUN" &&
    policy.mode !== "INTERNAL_RECIPIENTS" &&
    policy.mode !== "LIMITED_COHORT" &&
    policy.mode !== "LIVE"
  ) {
    return { ready: false, reason: `Email automation mode ${policy.mode} is not enabled for E4 execution.` };
  }
  return { ready: true, reason: null };
}

async function assertContactMayReceiveAutomation(input: { workspaceId: string; contactId: string; purpose: "TRANSACTIONAL" | "MARKETING" }) {
  const contact = await prisma.whatsAppContact.findUnique({
    where: { id: input.contactId },
    select: { id: true, email: true, displayName: true, profileName: true, consentStatus: true },
  });
  if (!contact) throw new Error("Automation contact not found.");
  if (!contact.email) throw new Error("Automation contact has no email address.");
  if (contact.consentStatus === "OPTED_OUT") throw new Error("Automation contact is opted out.");

  const now = new Date();
  const suppression = await prisma.engageCustomerSuppression.findFirst({
    where: {
      workspaceId: input.workspaceId,
      revokedAt: null,
      startsAt: { lte: now },
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { OR: [{ customerRef: null }, { customerRef: input.contactId }] },
        { OR: [{ channel: null }, { channel: "EMAIL" }] },
      ],
    },
    select: { id: true, reason: true },
  });
  if (suppression) throw new Error(`Automation email is suppressed: ${suppression.reason}.`);
  if (input.purpose === "MARKETING") {
    const latestConsent = await prisma.engageCustomerConsentEvent.findFirst({
      where: { workspaceId: input.workspaceId, customerRef: input.contactId, channel: "EMAIL", purpose: "MARKETING" },
      orderBy: { occurredAt: "desc" },
      select: { state: true },
    });
    if (latestConsent?.state !== "GRANTED") throw new Error("Affirmative EMAIL marketing consent is required for lifecycle automation.");
  }
  return { ...contact, email: contact.email };
}

export async function processEmailAutomationEvents(input: {
  workspaceId: string;
  actorUserId: string;
  limit?: number;
}) {
  const policy = automationPolicyReady();
  if (!policy.ready) return { processed: 0, failed: 0, skipped: 0, recovered: 0, paused: true, reason: policy.reason, results: [] as unknown[] };

  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  const recovered = await prisma.engageEmailAutomationEvent.updateMany({
    where: { workspaceId: input.workspaceId, status: "PROCESSING", updatedAt: { lt: staleBefore } },
    data: { status: "FAILED", lastError: "Automation processing lease expired after 15 minutes. Requeue is required." },
  });

  const now = new Date();
  const events = await prisma.engageEmailAutomationEvent.findMany({
    where: { workspaceId: input.workspaceId, status: "PENDING", availableAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(input.limit ?? 20, 1), 100),
  });
  const flows = (await listAutomationFlows()).filter(
    (flow) => flow.workspaceId === input.workspaceId && flow.status === "ACTIVE",
  );
  const sender = new ManualEmailSendService();
  const results: Array<Record<string, unknown>> = [];
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of events) {
    const claimed = await prisma.engageEmailAutomationEvent.updateMany({
      where: { id: event.id, workspaceId: input.workspaceId, status: "PENDING" },
      data: { status: "PROCESSING", attemptCount: { increment: 1 }, lastError: null },
    });
    if (claimed.count !== 1) {
      skipped += 1;
      continue;
    }

    try {
      const triggers = new Set([event.trigger, ...relatedTriggers(event.relatedTriggers)]);
      const eventPayload = record(event.payload);
      const targetFlowId = typeof eventPayload.targetFlowId === "string" ? eventPayload.targetFlowId.trim() : "";
      const targetFlowVersion = Number(eventPayload.targetFlowVersion);
      const matching = flows.filter((flow) => {
        const trigger = flow.nodes.find((node) => node.kind === "TRIGGER");
        if (!trigger || !triggers.has(trigger.type)) return false;
        if (targetFlowId && flow.flowId !== targetFlowId) return false;
        if (targetFlowId && Number.isFinite(targetFlowVersion) && flow.version !== targetFlowVersion) return false;
        return true;
      });
      let actionCount = 0;
      for (const flow of matching) {
        const actions = flow.nodes.filter((item) => item.kind === "ACTION");
        const resumeIndex = targetFlowId === flow.flowId && Number.isInteger(Number(eventPayload.resumeActionIndex)) ? Math.max(0, Number(eventPayload.resumeActionIndex)) : 0;
        const context = event.contactId ? await emailAutomationContactContext(event.contactId) : null;
        const values = {
          ...primitiveVariables(event.payload),
          ...(context ? { contactId: context.id, contactEmail: context.email ?? "", contactName: context.displayName || context.profileName || context.email || "", ...(context.lead ? { "lead.stage": context.lead.stage, leadStage: context.lead.stage } : {}) } : {}),
        };
        for (let actionIndex = resumeIndex; actionIndex < actions.length; actionIndex += 1) {
          const node = actions[actionIndex];
          if (node.type === "END") { actionCount += 1; break; }
          if (node.type === "CONDITION") { actionCount += 1; if (!emailAutomationConditionPasses(node.config.field, values)) break; continue; }
          if (node.type === "WAIT") {
            const minutes = Number(node.config.minutes);
            if (!Number.isFinite(minutes) || minutes < 1 || minutes > 43_200) throw new Error("WAIT action minutes are invalid.");
            await prisma.$transaction(async (tx) => enqueueEmailAutomationEvent(tx, { workspaceId: input.workspaceId, sourceEventId: `${event.sourceEventId}:wait:${flow.flowId}:v${flow.version}:${node.id}`, trigger: event.trigger as never, contactId: event.contactId, leadId: event.leadId, submissionId: event.submissionId, availableAt: new Date(Date.now() + Math.floor(minutes) * 60_000), payload: { ...eventPayload, targetFlowId: flow.flowId, targetFlowVersion: flow.version, resumeActionIndex: actionIndex + 1 } }));
            actionCount += 1; break;
          }
          if (node.type === "SEND_EMAIL") {
            const templateId = typeof node.config.templateId === "string" ? node.config.templateId.trim() : "";
            const templateVersionId = typeof node.config.templateVersionId === "string" ? node.config.templateVersionId.trim() : "";
            if (!templateId || !templateVersionId) throw new Error(`Flow ${flow.name} has an unpinned SEND_EMAIL action.`);
            if (!event.contactId) throw new Error("Email automation event has no contactId.");
            const emailPurpose = node.config.emailPurpose === "MARKETING" ? "MARKETING" : "TRANSACTIONAL";
            const deliverable = await assertContactMayReceiveAutomation({ workspaceId: input.workspaceId, contactId: event.contactId, purpose: emailPurpose });
            const sendValues = {
              ...values,
              ...(emailPurpose === "MARKETING"
                ? { unsubscribe_url: createEmailUnsubscribeUrl({ workspaceId: input.workspaceId, contactId: event.contactId, email: deliverable.email }) }
                : {}),
            };
            const rawKey = buildEmailAutomationIdempotencyKey({ workspaceId: input.workspaceId, automationId: flow.flowId, automationVersion: flow.version, triggerEventId: event.id, contactId: event.contactId, actionNodeId: node.id });
            const result = await sender.send({ workspaceId: input.workspaceId, templateId, templateVersionId, automationSenderIdentityId: typeof node.config.senderIdentityId === "string" ? node.config.senderIdentityId : null, to: [{ email: deliverable.email, name: deliverable.displayName || deliverable.profileName || undefined }], variables: sendValues, idempotencyKey: compactIdempotencyKey(rawKey), actorUserId: flow.createdBy || input.actorUserId, deliveryContext: "AUTOMATION" });
            actionCount += 1;
            results.push({ eventId: event.id, flowId: flow.flowId, nodeId: node.id, messageId: result.message.id, replayed: result.replayed });
            if (result.message.externalRequestSent) {
              for (const candidate of flows.filter((item) => item.nodes.some((entry) => entry.kind === "TRIGGER" && entry.type === "NO_REPLY"))) {
                const noReply = candidate.nodes.find((entry) => entry.kind === "TRIGGER" && entry.type === "NO_REPLY");
                const waitMinutes = Number(noReply?.config.waitMinutes);
                if (!Number.isFinite(waitMinutes) || waitMinutes < 1 || waitMinutes > 43_200) continue;
                await prisma.$transaction(async (tx) => enqueueEmailAutomationEvent(tx, { workspaceId: input.workspaceId, sourceEventId: `no-reply:${result.message.id}:${candidate.flowId}:v${candidate.version}`, trigger: "NO_REPLY", contactId: event.contactId, availableAt: new Date(Date.now() + Math.floor(waitMinutes) * 60_000), payload: { targetFlowId: candidate.flowId, targetFlowVersion: candidate.version, messageId: result.message.id, waitMinutes: Math.floor(waitMinutes) } }));
              }
            }
            continue;
          }
          if (["ADD_TAG", "REMOVE_TAG", "UPDATE_STAGE", "ASSIGN_COUNSELOR", "CREATE_TASK", "HUMAN_HANDOFF"].includes(node.type)) {
            if (!event.contactId) throw new Error(`${node.type} requires contactId.`);
            await executeEmailAutomationCrmAction({ workspaceId: input.workspaceId, flowId: flow.flowId, eventId: event.id, contactId: event.contactId, node: { type: node.type, config: node.config, id: node.id }, actorUserId: flow.createdBy || input.actorUserId });
            actionCount += 1; continue;
          }
          actionCount += 1;
        }
      }      await prisma.engageEmailAutomationEvent.update({
        where: { id: event.id },
        data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
      });
      processed += 1;
      if (actionCount === 0) results.push({ eventId: event.id, matchedEmailActions: 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email automation processing failed.";
      await prisma.engageEmailAutomationEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", lastError: message },
      });
      failed += 1;
      results.push({ eventId: event.id, error: message });
    }
  }

  return { processed, failed, skipped, recovered: recovered.count, paused: false, reason: null, results };
}
