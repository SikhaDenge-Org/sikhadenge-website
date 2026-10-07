import { prisma } from "../lib/db/prisma";
import {
  listAutomationFlowsForWorkspace,
  setAutomationFlowStatus,
  validateAutomationFlow,
} from "../lib/automation/automation-service";
import { LIFECYCLE_EMAIL_DEFINITIONS } from "../modules/email-automation/automation/lifecycle-provisioning";
import { buildEmailTemplateRuntime } from "../modules/email-automation/infrastructure/template-runtime";
import { PrismaEmailSenderRepository } from "../modules/email-automation/infrastructure/prisma-email-sender-repository";

const WORKSPACE_SLUG = "sikhadenge-default";
const SUPPORT_EMAIL = "support@sikhadenge.in";
const EXPECTED = LIFECYCLE_EMAIL_DEFINITIONS.length;

function enabled(value: string | undefined): boolean {
  return ["true", "1", "yes"].includes((value ?? "").trim().toLowerCase());
}

async function main() {
  const runtimeMode = (process.env.EMAIL_RUNTIME_MODE || "").trim().toUpperCase();
  const runtimeEnabled = enabled(process.env.EMAIL_RUNTIME_ENABLED);
  const automationEnabled = enabled(process.env.EMAIL_AUTOMATION_ENABLED);
  const externalWritesEnabled = enabled(process.env.EMAIL_EXTERNAL_WRITES_ENABLED);
  if (runtimeMode !== "DRY_RUN" || !runtimeEnabled || !automationEnabled || externalWritesEnabled) {
    throw new Error("Lifecycle activation requires EMAIL_RUNTIME_MODE=DRY_RUN, runtime+automation enabled, and external writes disabled.");
  }

  const workspace = await prisma.engageWorkspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true, isActive: true },
  });
  if (!workspace?.isActive) throw new Error("Default SikhaDenge workspace is unavailable.");

  const membership = await prisma.engageWorkspaceMembership.findFirst({
    where: { workspaceId: workspace.id, isActive: true, user: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!membership) throw new Error("No active workspace member is available for lifecycle activation.");

  const connections = await prisma.engageChannelConnection.findMany({
    where: { workspaceId: workspace.id, channel: "EMAIL" },
    select: { id: true, status: true },
  });
  const senders = await new PrismaEmailSenderRepository().listByWorkspace(workspace.id);
  const supportSender = senders.find((sender) => sender.fromEmail.toLowerCase() === SUPPORT_EMAIL);
  if (!supportSender?.isActive || supportSender.verificationStatus !== "VERIFIED" || !supportSender.isWorkspaceDefault) {
    throw new Error("support@sikhadenge.in must be active, verified, and the workspace default sender.");
  }
  const supportConnection = connections.find((connection) => connection.id === supportSender.connectionId);
  if (supportConnection?.status !== "CONNECTED") throw new Error("support@sikhadenge.in email connection is not CONNECTED.");

  const templateRuntime = buildEmailTemplateRuntime();
  const templateSummaries = await templateRuntime.service.list(workspace.id);
  const flows = await listAutomationFlowsForWorkspace(workspace.id, false);
  const lifecycleFlows = flows.filter((flow) =>
    LIFECYCLE_EMAIL_DEFINITIONS.some((definition) => definition.name === flow.name),
  );
  if (lifecycleFlows.length !== EXPECTED) {
    throw new Error(`Expected ${EXPECTED} lifecycle flows, found ${lifecycleFlows.length}.`);
  }

  const preflight: Array<{ name: string; flowId: string; status: string }> = [];
  for (const definition of LIFECYCLE_EMAIL_DEFINITIONS) {
    const templateSummary = templateSummaries.find((item) => item.name === definition.name);
    if (!templateSummary) throw new Error(`Lifecycle template is missing: ${definition.name}.`);
    const template = await templateRuntime.service.get({ workspaceId: workspace.id, templateId: templateSummary.id });
    const version = template.versions.find((candidate) => candidate.version === template.currentVersion);
    if (template.status !== "APPROVED" || !version?.approvedAt) {
      throw new Error(`Lifecycle template current version is not approved: ${definition.name}.`);
    }

    const flow = lifecycleFlows.find((item) => item.name === definition.name);
    if (!flow) throw new Error(`Lifecycle flow is missing: ${definition.name}.`);
    if (!["DRAFT", "ACTIVE"].includes(flow.status)) {
      throw new Error(`Lifecycle flow must be DRAFT or ACTIVE before activation: ${definition.name}.`);
    }
    const validation = validateAutomationFlow(flow);
    if (!validation.valid) {
      throw new Error(`Lifecycle flow validation failed for ${definition.name}: ${validation.errors.join(" ")}`);
    }
    const sendNodes = flow.nodes.filter((node) => node.kind === "ACTION" && node.type === "SEND_EMAIL");
    if (sendNodes.length !== 1) throw new Error(`Lifecycle flow must contain one SEND_EMAIL action: ${definition.name}.`);
    const send = sendNodes[0];
    if (
      send.config.templateId !== template.id ||
      send.config.templateVersionId !== version.id ||
      send.config.senderIdentityId !== supportSender.id ||
      send.config.emailPurpose !== definition.purpose
    ) {
      throw new Error(`Lifecycle flow pins are invalid: ${definition.name}.`);
    }
    if (
      definition.purpose === "MARKETING" &&
      !(
        version.document.variables.some((variable) => variable.key === "unsubscribe_url" && variable.required) &&
        version.document.blocks.some((block) => block.type === "BUTTON" && block.url.includes("{{unsubscribe_url}}"))
      )
    ) {
      throw new Error(`Marketing unsubscribe contract is invalid: ${definition.name}.`);
    }
    preflight.push({ name: definition.name, flowId: flow.flowId, status: flow.status });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const item of preflight) {
    if (item.status === "ACTIVE") {
      results.push({ ...item, activatedNow: false, idempotent: true });
      continue;
    }
    const updated = await setAutomationFlowStatus({
      flowId: item.flowId,
      status: "ACTIVE",
      actorId: membership.userId,
      workspaceId: workspace.id,
    });
    if (updated.flow.status !== "ACTIVE" || !updated.validation.valid) {
      throw new Error(`Lifecycle activation did not persist safely: ${item.name}.`);
    }
    results.push({ name: item.name, flowId: item.flowId, status: updated.flow.status, activatedNow: true, idempotent: false });
  }

  const after = (await listAutomationFlowsForWorkspace(workspace.id, false)).filter((flow) =>
    LIFECYCLE_EMAIL_DEFINITIONS.some((definition) => definition.name === flow.name),
  );
  const activeFlows = after.filter((flow) => flow.status === "ACTIVE").length;
  if (activeFlows !== EXPECTED) throw new Error(`Lifecycle activation incomplete: ${activeFlows}/${EXPECTED} flows ACTIVE.`);

  console.log(JSON.stringify({
    workspaceId: workspace.id,
    runtimeMode,
    runtimeEnabled,
    automationEnabled,
    externalWritesEnabled,
    supportSender: SUPPORT_EMAIL,
    totalFlows: after.length,
    activeFlows,
    activatedNow: results.filter((item) => item.activatedNow === true).length,
    alreadyActive: results.filter((item) => item.idempotent === true).length,
    externalRequestSent: false,
    results,
  }));
  console.log("EMAIL_LIFECYCLE_ACTIVATION=PASS");
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  try { await prisma.$disconnect(); } catch {}
  process.exitCode = 1;
}).finally(async () => {
  try { await prisma.$disconnect(); } catch {}
});
