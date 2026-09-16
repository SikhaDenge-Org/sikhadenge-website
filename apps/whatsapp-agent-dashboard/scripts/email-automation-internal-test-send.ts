import { prisma } from "@/lib/db/prisma";
import { buildEmailE1Runtime } from "@/modules/email-automation/infrastructure/runtime";
import { ManualEmailSendService } from "@/modules/email-automation/application/manual-send-service";
import { getEmailRuntimePolicy } from "@/modules/email-automation/application/runtime-policy";

const recipient = (process.env.EMAIL_INTERNAL_TEST_RECIPIENT || "").trim().toLowerCase();
const senderEmail = (process.env.EMAIL_INTERNAL_TEST_SENDER || "support@sikhadenge.in").trim().toLowerCase();
const idempotencyKey = (process.env.EMAIL_INTERNAL_TEST_IDEMPOTENCY_KEY || "").trim();

function fail(message: string): never { throw new Error(message); }

async function main() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) fail("Valid internal test recipient is required.");
  if (!idempotencyKey || idempotencyKey.length < 8) fail("Internal test idempotency key is required.");
  const policy = getEmailRuntimePolicy();
  if (policy.mode !== "INTERNAL_RECIPIENTS" || !policy.runtimeEnabled || !policy.externalWritesEnabled) {
    fail("Runtime is not in guarded INTERNAL_RECIPIENTS delivery mode.");
  }
  const allowlist = new Set((process.env.EMAIL_INTERNAL_RECIPIENT_ALLOWLIST || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean));
  if (allowlist.size !== 1 || !allowlist.has(recipient)) fail("Internal recipient allowlist must contain exactly the test recipient.");
  if (policy.automationEnabled) fail("Email automation must be disabled during the one-shot internal test.");
  const emailRuntime = buildEmailE1Runtime();
  const workspaces = await prisma.engageWorkspace.findMany({ where: { isActive: true }, select: { id: true }, orderBy: { createdAt: "asc" } });
  let workspaceId = "";
  let senderIdentityId = "";
  for (const workspace of workspaces) {
    const senders = await emailRuntime.senders.listByWorkspace(workspace.id);
    const sender = senders.find(item => item.fromEmail.trim().toLowerCase() === senderEmail && item.isActive && item.verificationStatus === "VERIFIED");
    if (sender) { workspaceId = workspace.id; senderIdentityId = sender.id; break; }
  }
  if (!workspaceId || !senderIdentityId) fail("Verified internal test sender was not found.");

  const template = await prisma.engageEmailTemplate.findFirst({
    where: { workspaceId, status: "APPROVED", approvedAt: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!template) fail("No APPROVED email template is available for the internal test.");
  const membership = await prisma.engageWorkspaceMembership.findFirst({
    where: { workspaceId, isActive: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { userId: true },
  });
  if (!membership) fail("No active workspace member is available for audit attribution.");

  const result = await new ManualEmailSendService().send({
    workspaceId,
    templateId: template.id,
    manualSenderIdentityId: senderIdentityId,
    to: [{ email: recipient, name: "SikhaDenge Internal Test" }],
    cc: [], bcc: [],
    variables: {},
    idempotencyKey,
    actorUserId: membership.userId,
    subjectOverride: "SikhaDenge Email Internal Test",
    htmlOverride: "<p>SikhaDenge internal email delivery verification.</p><p>This is a controlled internal test message.</p>",
    textOverride: "SikhaDenge internal email delivery verification. This is a controlled internal test message.",
  });
  const message = result.message;
  console.log(`EMAIL_INTERNAL_TEST_STATUS=${message.status}`);
  console.log(`EMAIL_INTERNAL_TEST_EXTERNAL_REQUEST_SENT=${message.externalRequestSent ? "true" : "false"}`);
  console.log(`EMAIL_INTERNAL_TEST_REPLAYED=${result.replayed ? "true" : "false"}`);
  console.log(`EMAIL_INTERNAL_TEST_MESSAGE_ID=${message.id}`);
  if (message.status !== "SENT" || !message.externalRequestSent) fail("Provider did not confirm the internal test send.");
}

main().catch((error) => {
  console.error(`EMAIL_INTERNAL_TEST_ERROR=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
