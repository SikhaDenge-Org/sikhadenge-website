import { prisma } from "../lib/db/prisma";
import {
  listAutomationFlowsForWorkspace,
  updateAutomationFlow,
  validateAutomationFlow,
} from "../lib/automation/automation-service";
import {
  buildLifecycleEmailDocument,
  LIFECYCLE_EMAIL_DEFINITIONS,
} from "../modules/email-automation/automation/lifecycle-provisioning";
import { buildEmailTemplateRuntime } from "../modules/email-automation/infrastructure/template-runtime";
import { PrismaEmailSenderRepository } from "../modules/email-automation/infrastructure/prisma-email-sender-repository";

const WORKSPACE_SLUG = "sikhadenge-default";
const SUPPORT_EMAIL = "support@sikhadenge.in";

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
async function main() {
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
  if (!membership) throw new Error("No active workspace member is available for lifecycle approval.");

  const senders = await new PrismaEmailSenderRepository().listByWorkspace(workspace.id);
  const supportSender = senders.find((sender) => sender.fromEmail.toLowerCase() === SUPPORT_EMAIL);
  if (!supportSender?.isActive || supportSender.verificationStatus !== "VERIFIED") {
    throw new Error("support@sikhadenge.in must be verified and active before lifecycle approval.");
  }
  if (!supportSender.isWorkspaceDefault) throw new Error("support@sikhadenge.in must be the workspace default sender.");
  const templateRuntime = buildEmailTemplateRuntime();
  const flows = await listAutomationFlowsForWorkspace(workspace.id, false);
  const results: Array<Record<string, unknown>> = [];

  for (const definition of LIFECYCLE_EMAIL_DEFINITIONS) {
    const summary = (await templateRuntime.service.list(workspace.id)).find((item) => item.name === definition.name);
    if (!summary) throw new Error(`Lifecycle template is missing: ${definition.name}.`);
    let detail = await templateRuntime.service.get({ workspaceId: workspace.id, templateId: summary.id });
    const desiredDocument = buildLifecycleEmailDocument(definition);
    let currentVersion = detail.versions.find((item) => item.version === detail.currentVersion);
    if (!currentVersion) throw new Error(`Current template version is missing: ${definition.name}.`);

    const contentMatches = sameJson(currentVersion.document, desiredDocument);
    const senderMatches = currentVersion.defaultSenderIdentityId === supportSender.id;
    if (detail.status === "DRAFT" && (!contentMatches || !senderMatches)) {
      detail = await templateRuntime.service.createDraftVersion({
        workspaceId: workspace.id,
        templateId: detail.id,
        expectedCurrentVersion: detail.currentVersion,
        document: desiredDocument,
        defaultSenderIdentityId: supportSender.id,
        actorUserId: membership.userId,
      });
      currentVersion = detail.versions.find((item) => item.version === detail.currentVersion);
      if (!currentVersion) throw new Error(`Updated template version is missing: ${definition.name}.`);
    }
    if (detail.status === "DRAFT") {
      detail = await templateRuntime.service.transition({
        workspaceId: workspace.id,
        templateId: detail.id,
        toStatus: "IN_REVIEW",
        actorUserId: membership.userId,
      });
    }
    if (detail.status === "IN_REVIEW") {
      detail = await templateRuntime.service.transition({
        workspaceId: workspace.id,
        templateId: detail.id,
        toStatus: "APPROVED",
        actorUserId: membership.userId,
      });
    }
    if (detail.status !== "APPROVED") throw new Error(`Lifecycle template cannot be approved from ${detail.status}: ${definition.name}.`);

    currentVersion = detail.versions.find((item) => item.version === detail.currentVersion);
    if (!currentVersion?.approvedAt) throw new Error(`Approved immutable version is unavailable: ${definition.name}.`);
    if (!sameJson(currentVersion.document, desiredDocument)) throw new Error(`Approved content does not match reviewed lifecycle copy: ${definition.name}.`);
    if (currentVersion.defaultSenderIdentityId !== supportSender.id) throw new Error(`Approved template is not pinned to support sender: ${definition.name}.`);
    const flow = flows.find((item) => item.name === definition.name);
    if (!flow) throw new Error(`Lifecycle flow is missing: ${definition.name}.`);
    if (flow.status !== "DRAFT") throw new Error(`Lifecycle flow must remain DRAFT during approval: ${definition.name}.`);
    const sendNodes = flow.nodes.filter((node) => node.kind === "ACTION" && node.type === "SEND_EMAIL");
    if (sendNodes.length !== 1) throw new Error(`Lifecycle flow must contain exactly one SEND_EMAIL action: ${definition.name}.`);

    const nodes = flow.nodes.map((node) => node.kind === "ACTION" && node.type === "SEND_EMAIL"
      ? {
          ...node,
          config: {
            ...node.config,
            templateId: detail.id,
            templateVersionId: currentVersion!.id,
            senderIdentityId: supportSender.id,
            emailPurpose: definition.purpose,
          },
        }
      : node);
    const sendNode = nodes.find((node) => node.kind === "ACTION" && node.type === "SEND_EMAIL");
    const needsFlowUpdate = !sameJson(sendNodes[0].config, sendNode?.config);
    const updated = needsFlowUpdate
      ? await updateAutomationFlow({ flowId: flow.flowId, nodes, actorId: membership.userId, workspaceId: workspace.id })
      : { flow, validation: validateAutomationFlow(flow) };
    if (updated.flow.status !== "DRAFT") throw new Error(`Lifecycle flow status changed unexpectedly: ${definition.name}.`);
    if (!updated.validation.valid) throw new Error(`Lifecycle flow validation failed for ${definition.name}: ${updated.validation.errors.join(" ")}`);
    results.push({
      name: definition.name,
      purpose: definition.purpose,
      templateStatus: detail.status,
      templateVersion: detail.currentVersion,
      templateVersionId: currentVersion.id,
      flowStatus: updated.flow.status,
      flowVersion: updated.flow.version,
      flowUpdated: needsFlowUpdate,
    });
  }

  console.log(JSON.stringify({
    workspaceId: workspace.id,
    approvedTemplates: results.filter((item) => item.templateStatus === "APPROVED").length,
    totalTemplates: results.length,
    draftFlows: results.filter((item) => item.flowStatus === "DRAFT").length,
    totalFlows: results.length,
    supportSender: SUPPORT_EMAIL,
    activated: false,
    results,
  }));
  console.log("EMAIL_LIFECYCLE_APPROVAL=PASS");
}
main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  try { await prisma.$disconnect(); } catch {}
  process.exitCode = 1;
}).finally(async () => {
  try { await prisma.$disconnect(); } catch {}
});
