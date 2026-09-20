import { prisma } from "@/lib/db/prisma";
import { listAutomationFlowsForWorkspace } from "@/lib/automation/automation-service";
import { enqueueWhatsAppAutomationEvent } from "@/modules/automations/application/whatsapp-automation-event-outbox";

const WORKSPACE_ID = "engagews_default";
const FLOW_NAME = "WhatsApp Phase21E No-Send Canary";
const KEYWORD = "__sikhadenge_canary_21e_20260920__";
const TAG_NAME = "CANARY_INTERNAL_TEST";
const SOURCE_EVENT_ID = process.env.PHASE21G_SOURCE_EVENT_ID?.trim() ?? "";

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function resolveDesignatedCanaryConversation() {
  const contacts = await prisma.whatsAppContact.findMany({
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
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        take: 2,
        select: {
          id: true,
          tags: { select: { tag: { select: { name: true } } } },
        },
      },
    },
  });

  const eligible = contacts.filter((contact) => {
    const metadata = rec(contact.metadata);
    const engageos = rec(metadata.engageos);
    const identity = rec(engageos.whatsappIdentity);
    const canary = rec(engageos.canary);
    const conversation = contact.conversations[0];
    const tagNames = conversation?.tags.map((row) => row.tag.name) ?? [];
    return (
      identity.workspaceId === WORKSPACE_ID &&
      canary.designated === true &&
      canary.kind === "INTERNAL_TEST" &&
      Boolean(conversation) &&
      tagNames.includes(TAG_NAME)
    );
  });

  if (eligible.length !== 1) {
    throw new Error(`Phase21G requires exactly one designated internal/test canary; found ${eligible.length}.`);
  }

  return {
    contactId: eligible[0].id,
    conversationId: eligible[0].conversations[0]!.id,
  };
}

async function main() {
  if (!SOURCE_EVENT_ID.startsWith("phase21g-canary:")) {
    throw new Error("PHASE21G_SOURCE_EVENT_ID must use the reserved phase21g-canary prefix.");
  }

  const flows = await listAutomationFlowsForWorkspace(WORKSPACE_ID, false);
  const flow = flows.find((item) => item.name === FLOW_NAME);
  if (!flow || flow.status !== "ACTIVE") throw new Error("Published Phase21E canary flow is unavailable.");
  const trigger = flow.nodes[0];
  const terminal = flow.nodes[1];
  if (
    flow.nodes.length !== 2 ||
    trigger?.kind !== "TRIGGER" ||
    trigger.type !== "INCOMING_KEYWORD" ||
    trigger.config.keyword !== KEYWORD ||
    terminal?.kind !== "ACTION" ||
    terminal.type !== "END"
  ) {
    throw new Error("Phase21E canary flow no longer matches the locked END-only contract.");
  }

  const published = await prisma.webhookEvent.findUnique({
    where: { eventKey: `automation-graph-published:${flow.flowId}:source-v${flow.version}` },
    select: { id: true },
  });
  if (!published) throw new Error("Phase21E canary graph is not published.");

  const context = await resolveDesignatedCanaryConversation();
  const row = await prisma.$transaction((tx) =>
    enqueueWhatsAppAutomationEvent(tx, {
      workspaceId: WORKSPACE_ID,
      sourceEventId: SOURCE_EVENT_ID,
      trigger: "INCOMING_KEYWORD",
      conversationId: context.conversationId,
      contactId: context.contactId,
      payload: {
        text: KEYWORD,
        targetFlowId: flow.flowId,
        targetFlowVersion: flow.version,
        qualification: "PHASE21G_TARGETED_DESIGNATED_CANARY",
      },
    }),
  );

  if (row.sourceEventId !== SOURCE_EVENT_ID || row.status !== "PENDING") {
    throw new Error("Phase21G designated canary event was not queued in the expected pending state.");
  }

  process.stdout.write(JSON.stringify({
    mode: "PHASE21G_TARGETED_DESIGNATED_CANARY_ENQUEUE",
    trigger: row.trigger,
    status: row.status,
    designatedInternalCanaryVerified: true,
    targetFlowPinned: true,
    publishedFlowVersion: flow.version,
    externalWritesAttempted: false,
  }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : "Phase21G designated canary enqueue failed.") + "\n");
  process.exitCode = 1;
});
