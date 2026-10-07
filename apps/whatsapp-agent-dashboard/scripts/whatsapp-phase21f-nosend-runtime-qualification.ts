import { prisma } from "@/lib/db/prisma";
import { listAutomationFlowsForWorkspace } from "@/lib/automation/automation-service";
import { executePublishedAutomation } from "@/modules/automations/application/runtime-executor";

const WORKSPACE_ID = "engagews_default";
const FLOW_NAME = "WhatsApp Phase21E No-Send Canary";
const QUALIFICATION_EVENT_ID = process.env.PHASE21F_QUALIFICATION_EVENT_ID?.trim() ?? "";

if (!QUALIFICATION_EVENT_ID) {
  throw new Error("PHASE21F_QUALIFICATION_EVENT_ID is required.");
}

async function resolveConversationId() {
  const pending = await prisma.engageWhatsAppAutomationEvent.findFirst({
    where: {
      workspaceId: WORKSPACE_ID,
      trigger: "INCOMING_KEYWORD",
      status: "PENDING",
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    select: { conversationId: true, contactId: true },
  });
  if (!pending) throw new Error("No pending INCOMING_KEYWORD event exists for runtime qualification.");
  if (pending.conversationId) return pending.conversationId;
  if (!pending.contactId) throw new Error("Pending event has no resolvable conversation.");

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { contactId: pending.contactId },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });
  if (!conversation) throw new Error("Pending event contact has no WhatsApp conversation.");
  return conversation.id;
}

async function main() {
  if (process.env.WHATSAPP_OUTBOUND_MODE !== "disabled") {
    throw new Error("Qualification requires WHATSAPP_OUTBOUND_MODE=disabled.");
  }
  if (process.env.WHATSAPP_OUTBOUND_KILL_SWITCH !== "on") {
    throw new Error("Qualification requires WHATSAPP_OUTBOUND_KILL_SWITCH=on.");
  }
  if (process.env.WHATSAPP_AUTOMATION_OUTBOUND_DISPATCH_ENABLED !== "false") {
    throw new Error("Qualification requires outbound dispatch disabled.");
  }

  const flows = await listAutomationFlowsForWorkspace(WORKSPACE_ID, false);
  const flow = flows.find((item) => item.name === FLOW_NAME);
  if (!flow) throw new Error("Phase21E no-send canary flow not found.");
  if (flow.status !== "ACTIVE") throw new Error("Phase21E no-send canary flow is not ACTIVE.");
  if (flow.nodes.length !== 2 || flow.nodes[0]?.type !== "INCOMING_KEYWORD" || flow.nodes[1]?.type !== "END") {
    throw new Error("Phase21E canary flow no longer matches the locked no-send contract.");
  }

  const publishedKey = `automation-graph-published:${flow.flowId}:source-v${flow.version}`;
  const published = await prisma.webhookEvent.findUnique({
    where: { eventKey: publishedKey },
    select: { id: true },
  });
  if (!published) throw new Error("Published canary graph is missing.");

  const conversationId = await resolveConversationId();
  const result = await executePublishedAutomation({
    flowId: flow.flowId,
    eventId: QUALIFICATION_EVENT_ID,
    conversationId,
    sample: {
      qualification: "PHASE21F_NO_SEND_RUNTIME",
      externalWriteAllowed: false,
    },
  });

  if (result.replayed) {
    throw new Error("No-send runtime qualification replayed a prior terminal run.");
  }
  if (result.run.status !== "COMPLETED") {
    throw new Error(`No-send runtime qualification did not complete: ${result.run.status}`);
  }
  if (result.outboundSent !== false) throw new Error("No-send runtime qualification reported outboundSent=true.");
  if (result.run.queuedMessageIds.length !== 0) throw new Error("No-send runtime qualification queued an outbound message.");

  process.stdout.write(JSON.stringify({
    mode: "PHASE21F_NO_SEND_RUNTIME_QUALIFICATION",
    status: result.run.status,
    replayed: result.replayed,
    flowVersion: result.run.flowVersion,
    queuedMessageCount: result.run.queuedMessageIds.length,
    outboundSent: result.outboundSent,
    globalPm2RuntimeFlagsMutated: false,
    externalWhatsAppWriteSent: false,
  }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : "Phase21F qualification failed.") + "\n");
  process.exitCode = 1;
});
