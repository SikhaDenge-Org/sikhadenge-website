import { prisma } from "@/lib/db/prisma";
import { listAutomationFlowsForWorkspace } from "@/lib/automation/automation-service";
import { enqueueWhatsAppAutomationEvent } from "@/modules/automations/application/whatsapp-automation-event-outbox";

const WORKSPACE_ID = "engagews_default";
const FLOW_NAME = "WhatsApp Phase21E No-Send Canary";
const KEYWORD = "__sikhadenge_canary_21e_20260920__";
const SOURCE_EVENT_ID = process.env.PHASE21G_SOURCE_EVENT_ID?.trim() ?? "";

async function resolveConversation() {
  const pending = await prisma.engageWhatsAppAutomationEvent.findFirst({
    where: {
      workspaceId: WORKSPACE_ID,
      trigger: "INCOMING_KEYWORD",
      status: "PENDING",
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    select: { conversationId: true, contactId: true },
  });
  if (!pending) throw new Error("No pending WhatsApp conversation context is available for Phase21G.");
  if (pending.conversationId) return { conversationId: pending.conversationId, contactId: pending.contactId };

  if (!pending.contactId) throw new Error("Pending automation event has no conversation or contact.");
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { contactId: pending.contactId },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, contactId: true },
  });
  if (!conversation) throw new Error("Pending automation contact has no WhatsApp conversation.");
  return { conversationId: conversation.id, contactId: conversation.contactId };
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

  const context = await resolveConversation();
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
        qualification: "PHASE21G_TARGETED_SCHEDULER_CANARY",
      },
    }),
  );

  if (row.sourceEventId !== SOURCE_EVENT_ID || row.status !== "PENDING") {
    throw new Error("Phase21G canary event was not queued in the expected pending state.");
  }

  process.stdout.write(JSON.stringify({
    mode: "PHASE21G_TARGETED_CANARY_ENQUEUE",
    trigger: row.trigger,
    status: row.status,
    targetFlowPinned: true,
    publishedFlowVersion: flow.version,
    externalWritesAttempted: false,
  }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : "Phase21G canary enqueue failed.") + "\n");
  process.exitCode = 1;
});
