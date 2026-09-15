import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { listAutomationFlows } from "@/lib/automation/automation-service";
import { ManualEmailSendService } from "../application/manual-send-service";
import { getEmailRuntimePolicy } from "../application/runtime-policy";
import { buildEmailAutomationIdempotencyKey } from "./contracts";

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
  if (policy.mode !== "DRY_RUN" && policy.mode !== "INTERNAL_RECIPIENTS") {
    return { ready: false, reason: `Email automation mode ${policy.mode} is not enabled for E4 execution.` };
  }
  return { ready: true, reason: null };
}

async function assertContactMayReceiveAutomation(input: { workspaceId: string; contactId: string }) {
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
  return { ...contact, email: contact.email };
}

export async function processEmailAutomationEvents(input: {
  workspaceId: string;
  actorUserId: string;
  limit?: number;
}) {
  const policy = automationPolicyReady();
  if (!policy.ready) return { processed: 0, failed: 0, skipped: 0, paused: true, reason: policy.reason, results: [] as unknown[] };

  const events = await prisma.engageEmailAutomationEvent.findMany({
    where: { workspaceId: input.workspaceId, status: "PENDING" },
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
      const matching = flows.filter((flow) => {
        const trigger = flow.nodes.find((node) => node.kind === "TRIGGER");
        return Boolean(trigger && triggers.has(trigger.type));
      });
      let actionCount = 0;
      for (const flow of matching) {
        for (const node of flow.nodes.filter((item) => item.kind === "ACTION" && item.type === "SEND_EMAIL")) {
          const templateId = typeof node.config.templateId === "string" ? node.config.templateId.trim() : "";
          if (!templateId) throw new Error(`Flow ${flow.name} has a SEND_EMAIL action without templateId.`);
          if (!event.contactId) throw new Error("Email automation event has no contactId.");
          const contact = await assertContactMayReceiveAutomation({ workspaceId: input.workspaceId, contactId: event.contactId });
          const rawKey = buildEmailAutomationIdempotencyKey({
            workspaceId: input.workspaceId,
            automationId: flow.flowId,
            automationVersion: flow.version,
            triggerEventId: event.id,
            contactId: event.contactId,
            actionNodeId: node.id,
          });
          const variables = {
            ...primitiveVariables(event.payload),
            contactId: contact.id,
            contactEmail: contact.email,
            contactName: contact.displayName || contact.profileName || contact.email,
          };
          const result = await sender.send({
            workspaceId: input.workspaceId,
            templateId,
            automationSenderIdentityId:
              typeof node.config.senderIdentityId === "string" ? node.config.senderIdentityId : null,
            to: [{ email: contact.email, name: contact.displayName || contact.profileName || undefined }],
            variables,
            idempotencyKey: compactIdempotencyKey(rawKey),
            actorUserId: flow.createdBy || input.actorUserId,
          });
          actionCount += 1;
          results.push({ eventId: event.id, flowId: flow.flowId, nodeId: node.id, messageId: result.message.id, replayed: result.replayed });
        }
      }
      await prisma.engageEmailAutomationEvent.update({
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

  return { processed, failed, skipped, paused: false, reason: null, results };
}