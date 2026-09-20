import { prisma } from "../lib/db/prisma";

const workspaceId = process.env.EMAIL_E6E7_WORKSPACE_ID || "engagews_default";
const runtimeMode = process.env.EMAIL_RUNTIME_MODE || "DISABLED";
const runtimeEnabled = process.env.EMAIL_RUNTIME_ENABLED === "true";
const automationEnabled = process.env.EMAIL_AUTOMATION_ENABLED === "true";
const externalWritesEnabled = process.env.EMAIL_EXTERNAL_WRITES_ENABLED === "true";
const now = new Date();
const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

async function main() {
  const workspace = await prisma.engageWorkspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });

  const [
    approvedTemplates,
    campaigns,
    campaignRecipientsFailed,
    sequences,
    sequenceEnrollmentsFailed,
    automationPending,
    automationFailed,
    analytics,
    activeEmailSuppressions,
  ] = await Promise.all([
    prisma.engageEmailTemplate.count({ where: { workspaceId, status: "APPROVED" } }),
    prisma.engageEmailCampaign.findMany({
      where: { workspaceId },
      select: { status: true },
      take: 500,
    }),
    prisma.engageEmailCampaignRecipient.count({
      where: { workspaceId, status: "FAILED" },
    }),
    prisma.engageEmailSequence.findMany({
      where: { workspaceId },
      select: { status: true },
      take: 500,
    }),
    prisma.engageEmailSequenceEnrollment.count({
      where: { workspaceId, status: "FAILED" },
    }),
    prisma.engageEmailAutomationEvent.count({
      where: { workspaceId, status: "PENDING" },
    }),
    prisma.engageEmailAutomationEvent.count({
      where: { workspaceId, status: "FAILED" },
    }),
    prisma.engageEmailAnalyticsEvent.findMany({
      where: { workspaceId, occurredAt: { gte: since } },
      select: { eventType: true },
      take: 5000,
    }),
    prisma.engageCustomerSuppression.count({
      where: {
        workspaceId,
        channel: "EMAIL",
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
  ]);

  const countBy = (values: Array<{ status: string }>) =>
    values.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});

  const analyticsByType = analytics.reduce<Record<string, number>>((acc, row) => {
    acc[row.eventType] = (acc[row.eventType] || 0) + 1;
    return acc;
  }, {});

  const checks = {
    workspacePresent: Boolean(workspace),
    safeRuntime: runtimeMode === "DRY_RUN" && runtimeEnabled && automationEnabled && !externalWritesEnabled,
    approvedTemplatePresent: approvedTemplates > 0,
  };

  const blockers: string[] = [];
  if (!checks.workspacePresent) blockers.push("Activation workspace is missing.");
  if (!checks.safeRuntime) blockers.push("Email runtime is not in protected DRY_RUN automation mode.");
  if (!checks.approvedTemplatePresent) blockers.push("No approved email template is available.");

  const output = {
    status: blockers.length ? "BLOCKED" : "READY",
    workspaceId,
    runtime: {
      mode: runtimeMode,
      runtimeEnabled,
      automationEnabled,
      externalWritesEnabled,
    },
    checks,
    campaigns: {
      total: campaigns.length,
      byStatus: countBy(campaigns),
      failedRecipients: campaignRecipientsFailed,
    },
    sequences: {
      total: sequences.length,
      byStatus: countBy(sequences),
      failedEnrollments: sequenceEnrollmentsFailed,
    },
    automationQueue: {
      pending: automationPending,
      failed: automationFailed,
    },
    deliverability: {
      analyticsLast30dByType: analyticsByType,
      activeEmailSuppressions,
    },
    approvedTemplates,
    blockers,
    observedAt: now.toISOString(),
  };

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  await prisma.$disconnect();
  if (blockers.length) process.exit(2);
}

main().catch(async (error) => {
  console.error(error);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
