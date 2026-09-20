import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { listAutomationFlowsForWorkspace } from "@/lib/automation/automation-service";

const WORKSPACE_ID = "engagews_default";
const FLOW_NAME = "WhatsApp Phase21E No-Send Canary";
const SOURCE_EVENT_ID = process.env.PHASE21G_SOURCE_EVENT_ID?.trim() ?? "";
const ACTIVATION_AT_RAW = process.env.PHASE21G_ACTIVATION_AT?.trim() ?? "";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function main() {
  if (!SOURCE_EVENT_ID.startsWith("phase21g-canary:")) {
    throw new Error("PHASE21G_SOURCE_EVENT_ID must use the reserved phase21g-canary prefix.");
  }
  const activationAt = new Date(ACTIVATION_AT_RAW);
  if (!ACTIVATION_AT_RAW || Number.isNaN(activationAt.getTime())) {
    throw new Error("PHASE21G_ACTIVATION_AT must be a valid timestamp.");
  }

  const event = await prisma.engageWhatsAppAutomationEvent.findFirst({
    where: {
      workspaceId: WORKSPACE_ID,
      sourceEventId: SOURCE_EVENT_ID,
      trigger: "INCOMING_KEYWORD",
    },
  });
  if (!event) throw new Error("Phase21G canary outbox event is missing.");
  if (event.status !== "PROCESSED") throw new Error(`Phase21G canary is not processed yet: ${event.status}`);
  if (event.attemptCount !== 1) throw new Error(`Phase21G canary attempt count is not 1: ${event.attemptCount}`);
  if (event.lastError) throw new Error(`Phase21G canary has an unexpected error: ${event.lastError}`);

  const designated = await prisma.whatsAppContact.findMany({
    where: {
      metadata: {
        path: ["engageos", "canary", "designated"],
        equals: true,
      },
    },
    take: 3,
    select: {
      id: true,
      metadata: true,
      conversations: {
        where: {
          tags: {
            some: {
              tag: { name: "CANARY_INTERNAL_TEST" },
            },
          },
        },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        take: 2,
        select: {
          id: true,
          tags: { select: { tag: { select: { name: true } } } },
        },
      },
    },
  });
  const eligibleDesignated = designated.filter((contact) => {
    const metadata = record(contact.metadata);
    const engageos = record(metadata.engageos);
    const identity = record(engageos.whatsappIdentity);
    const canary = record(engageos.canary);
    const taggedConversation = contact.conversations.find((conversation) =>
      conversation.tags.some((row) => row.tag.name === "CANARY_INTERNAL_TEST"),
    );
    return identity.workspaceId === WORKSPACE_ID &&
      canary.designated === true &&
      canary.kind === "INTERNAL_TEST" &&
      Boolean(taggedConversation);
  });
  if (eligibleDesignated.length !== 1) {
    throw new Error(`Expected exactly one designated internal/test canary; found ${eligibleDesignated.length}.`);
  }
  const designatedCanary = eligibleDesignated[0];
  const taggedConversation = designatedCanary.conversations.find((conversation) =>
    conversation.tags.some((row) => row.tag.name === "CANARY_INTERNAL_TEST"),
  );
  if (!taggedConversation || event.contactId !== designatedCanary.id || event.conversationId !== taggedConversation.id) {
    throw new Error("Phase21G canary event is not bound to the designated internal/test contact.");
  }

  const flows = await listAutomationFlowsForWorkspace(WORKSPACE_ID, false);
  const flow = flows.find((item) => item.name === FLOW_NAME);
  if (!flow) throw new Error("Phase21E canary flow is missing during verification.");

  const digest = createHash("sha256").update(`${flow.flowId}:${event.eventKey}`).digest("hex");
  const runtime = await prisma.webhookEvent.findUnique({
    where: { eventKey: `automation-runtime:${digest}` },
    select: { payload: true },
  });
  if (!runtime) throw new Error("Phase21G canary runtime record is missing.");

  const payload = record(runtime.payload);
  if (String(payload.status ?? "") !== "COMPLETED") {
    throw new Error(`Phase21G canary runtime did not complete: ${String(payload.status ?? "")}`);
  }
  const queued = Array.isArray(payload.queuedMessageIds) ? payload.queuedMessageIds : [];
  if (queued.length !== 0) throw new Error("Phase21G canary runtime queued an outbound message.");

  const nonCanaryMutations = await prisma.engageWhatsAppAutomationEvent.count({
    where: {
      workspaceId: WORKSPACE_ID,
      sourceEventId: { not: SOURCE_EVENT_ID },
      OR: [
        { processedAt: { gte: activationAt } },
        { claimedAt: { gte: activationAt } },
      ],
    },
  });
  if (nonCanaryMutations !== 0) {
    throw new Error(`Non-canary automation events mutated during targeted qualification: ${nonCanaryMutations}`);
  }

  const remainingNonCanaryDue = await prisma.engageWhatsAppAutomationEvent.count({
    where: {
      workspaceId: WORKSPACE_ID,
      sourceEventId: { not: SOURCE_EVENT_ID },
      status: "PENDING",
      availableAt: { lte: new Date() },
    },
  });

  process.stdout.write(JSON.stringify({
    mode: "PHASE21G_TARGETED_SCHEDULER_VERIFY",
    canaryStatus: event.status,
    canaryAttemptCount: event.attemptCount,
    runtimeStatus: payload.status,
    designatedInternalCanaryVerified: true,
    queuedMessageCount: queued.length,
    nonCanaryMutations,
    remainingNonCanaryDue,
    externalWhatsAppWriteSent: false,
  }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : "Phase21G canary verification failed.") + "\n");
  process.exitCode = 1;
});
