import { prisma } from "@/lib/db/prisma";
import {
  createAutomationFlow,
  listAutomationFlowsForWorkspace,
  setAutomationFlowStatus,
} from "@/lib/automation/automation-service";
import {
  publishAutomationGraph,
  syncAutomationGraphDraft,
} from "@/modules/automations/application/graph-version-service";

const WORKSPACE_ID = "engagews_default";
const FLOW_NAME = "WhatsApp Phase21E No-Send Canary";
const KEYWORD = "__sikhadenge_canary_21e_20260920__";

async function main() {
  const flows = await listAutomationFlowsForWorkspace(WORKSPACE_ID, false);
  const existing = flows.find((flow) => flow.name === FLOW_NAME) ?? null;
  const actorId = existing?.updatedBy || existing?.createdBy || flows[0]?.updatedBy || flows[0]?.createdBy;
  if (!actorId) throw new Error("No existing workspace automation actor is available for audited canary provisioning.");

  let flow = existing;
  let created = false;
  if (!flow) {
    const result = await createAutomationFlow({
      workspaceId: WORKSPACE_ID,
      name: FLOW_NAME,
      description: "Reserved-keyword production canary. Trigger to END only; no outbound action.",
      actorId,
      nodes: [
        {
          id: "phase21e-canary-trigger",
          kind: "TRIGGER",
          type: "INCOMING_KEYWORD",
          label: "Reserved canary keyword",
          config: { keyword: KEYWORD },
        },
        {
          id: "phase21e-canary-stop",
          kind: "ACTION",
          type: "END",
          label: "Stop without external action",
          config: {},
        },
      ],
    });
    flow = result.flow;
    created = true;
  }

  const trigger = flow.nodes[0];
  const terminal = flow.nodes[1];
  const safe =
    flow.workspaceId === WORKSPACE_ID &&
    flow.nodes.length === 2 &&
    trigger?.kind === "TRIGGER" &&
    trigger.type === "INCOMING_KEYWORD" &&
    trigger.config.keyword === KEYWORD &&
    terminal?.kind === "ACTION" &&
    terminal.type === "END";

  if (!safe) throw new Error("Existing canary flow does not match the locked no-send contract.");

  if (flow.status !== "ACTIVE") {
    const activated = await setAutomationFlowStatus({
      flowId: flow.flowId,
      status: "ACTIVE",
      actorId,
      workspaceId: WORKSPACE_ID,
    });
    flow = activated.flow;
  }

  const publishedKey = `automation-graph-published:${flow.flowId}:source-v${flow.version}`;
  const existingPublished = await prisma.webhookEvent.findUnique({
    where: { eventKey: publishedKey },
    select: { id: true },
  });

  let publishedNow = false;
  if (!existingPublished) {
    await syncAutomationGraphDraft({ flowId: flow.flowId, actorId });
    await publishAutomationGraph({ flowId: flow.flowId, actorId });
    publishedNow = true;
  }

  const afterPublished = await prisma.webhookEvent.findUnique({
    where: { eventKey: publishedKey },
    select: { id: true },
  });
  if (!afterPublished) throw new Error("Canary graph publication evidence is missing.");

  process.stdout.write(JSON.stringify({
    mode: "NO_SEND_CANARY_PROVISIONING",
    workspaceScoped: true,
    created,
    status: flow.status,
    flowVersion: flow.version,
    triggerType: trigger.type,
    terminalActionType: terminal.type,
    published: true,
    publishedNow,
    externalWriteCapableActionCount: 0,
    outboundMessagesQueued: false,
    externalWhatsAppWriteSent: false,
  }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : "Canary provisioning failed.") + "\n");
  process.exitCode = 1;
});
