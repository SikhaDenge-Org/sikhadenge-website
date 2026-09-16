import { prisma } from "../lib/db/prisma";
import { listAutomationFlowsForWorkspace } from "../lib/automation/automation-service";
import { PrismaEmailSenderRepository } from "../modules/email-automation/infrastructure/prisma-email-sender-repository";

const WORKSPACE_SLUG = "sikhadenge-default";
const PREFIX = "Lifecycle — ";
const EXPECTED = 5;

async function main() {
  const workspace = await prisma.engageWorkspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true, isActive: true },
  });
  if (!workspace?.isActive) throw new Error("Default SikhaDenge workspace is unavailable.");

  const connections = await prisma.engageChannelConnection.findMany({
    where: { workspaceId: workspace.id, channel: "EMAIL" },
    select: { id: true, status: true, externalAccountId: true },
    orderBy: { createdAt: "asc" },
  });
  const senders = await new PrismaEmailSenderRepository().listByWorkspace(workspace.id);
  const templates = await prisma.engageEmailTemplate.findMany({
    where: { workspaceId: workspace.id, name: { startsWith: PREFIX } },
    select: { id: true, name: true, status: true, currentVersion: true, approvedAt: true },
    orderBy: { name: "asc" },
  });
  const flows = (await listAutomationFlowsForWorkspace(workspace.id, false))
    .filter((flow) => flow.name.startsWith(PREFIX));
  const supportSender = senders.find((sender) => sender.fromEmail.toLowerCase() === "support@sikhadenge.in");
  const supportConnection = supportSender
    ? connections.find((connection) => connection.id === supportSender.connectionId)
    : undefined;

  const runtimeMode = (process.env.EMAIL_RUNTIME_MODE || "").trim().toUpperCase();
  const externalWrites = (process.env.EMAIL_EXTERNAL_WRITES_ENABLED || "false").trim().toLowerCase();
  const runtimeEnabled = (process.env.EMAIL_RUNTIME_ENABLED || "false").trim().toLowerCase();
  const automationEnabled = (process.env.EMAIL_AUTOMATION_ENABLED || "false").trim().toLowerCase();
  const safeRuntime = runtimeMode === "DRY_RUN" && !["true", "1", "yes"].includes(externalWrites);
  const supportVerified = Boolean(supportSender?.isActive && supportSender.verificationStatus === "VERIFIED");
  const supportDefault = Boolean(supportSender?.isWorkspaceDefault);
  const supportConnected = supportConnection?.status === "CONNECTED";
  const resourcesComplete = templates.length === EXPECTED && flows.length === EXPECTED;
  const approvedTemplates = templates.filter((template) => template.status === "APPROVED" && template.approvedAt).length;
  const draftFlows = flows.filter((flow) => flow.status === "DRAFT").length;

  const blockers: string[] = [];
  if (!safeRuntime) blockers.push("runtime_not_safe_dry_run");
  if (!supportConnected) blockers.push("support_connection_not_connected");
  if (!supportVerified) blockers.push("support_sender_not_verified");
  if (!supportDefault) blockers.push("support_sender_not_workspace_default");
  if (!resourcesComplete) blockers.push("lifecycle_resources_incomplete");
  if (approvedTemplates !== EXPECTED) blockers.push("lifecycle_templates_not_approved");
  const internalTestReady = safeRuntime && supportConnected && supportVerified && supportDefault && resourcesComplete;
  const lifecycleActivationReady = internalTestReady && approvedTemplates === EXPECTED;
  const result = {
    workspaceId: workspace.id,
    connectedEmailConnections: connections.filter((connection) => connection.status === "CONNECTED").length,
    senderCount: senders.length,
    supportSender: supportSender ? {
      provider: supportSender.provider,
      verificationStatus: supportSender.verificationStatus,
      isWorkspaceDefault: supportSender.isWorkspaceDefault,
      isActive: supportSender.isActive,
      connectionStatus: supportConnection?.status ?? "MISSING",
    } : null,
    runtime: { runtimeMode, externalWrites, runtimeEnabled, automationEnabled, safeRuntime },
    lifecycle: {
      templates: templates.map((template) => ({ name: template.name, status: template.status, approved: Boolean(template.approvedAt) })),
      flows: flows.map((flow) => ({ name: flow.name, status: flow.status })),
      totalTemplates: templates.length,
      totalFlows: flows.length,
      approvedTemplates,
      draftFlows,
    },
    internalTestReady,
    lifecycleActivationReady,
    blockers,
  };
  console.log(JSON.stringify(result));
  console.log(`EMAIL_LIFECYCLE_READINESS_AUDIT=PASS`);
  console.log(`EMAIL_INTERNAL_TEST_READY=${internalTestReady}`);
  console.log(`EMAIL_LIFECYCLE_ACTIVATION_READY=${lifecycleActivationReady}`);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  try { await prisma.$disconnect(); } catch {}
  process.exitCode = 1;
}).finally(async () => { try { await prisma.$disconnect(); } catch {} });
