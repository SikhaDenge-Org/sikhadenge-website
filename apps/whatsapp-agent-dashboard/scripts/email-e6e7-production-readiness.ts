import { prisma } from "../lib/db/prisma";

const workspaceId = process.env.EMAIL_E6E7_WORKSPACE_ID || "engagews_default";
const runtimeMode = process.env.EMAIL_RUNTIME_MODE || "DISABLED";
const runtimeEnabled = process.env.EMAIL_RUNTIME_ENABLED === "true";
const automationEnabled = process.env.EMAIL_AUTOMATION_ENABLED === "true";
const externalWritesEnabled = process.env.EMAIL_EXTERNAL_WRITES_ENABLED === "true";
const trackingEnabled = process.env.EMAIL_TRACKING_ENABLED === "true";
const now = new Date();
const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

async function main() {
  const workspace = await prisma.engageWorkspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });

  const [
    approvedTemplates,
    campaignTotal,
    campaignStatusRows,
    campaignRecipientsFailed,
    sequenceTotal,
    sequenceStatusRows,
    sequenceEnrollmentsFailed,
    automationPending,
    automationFailed,
    analytics,
    activeEmailSuppressions,
  ] = await Promise.all([
    prisma.engageEmailTemplate.count({ where: { workspaceId, status: "APPROVED" } }),
    prisma.engageEmailCampaign.count({ where: { workspaceId } }),
    prisma.engageEmailCampaign.groupBy({
      by: ["status"],
      where: { workspaceId },
      _count: { _all: true },
    }),
    prisma.engageEmailCampaignRecipient.count({
      where: { workspaceId, status: "FAILED" },
    }),
    prisma.engageEmailSequence.count({ where: { workspaceId } }),
    prisma.engageEmailSequence.groupBy({
      by: ["status"],
      where: { workspaceId },
      _count: { _all: true },
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
    prisma.engageEmailAnalyticsEvent.groupBy({
      by: ["eventType"],
      where: { workspaceId, occurredAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.engageCustomerSuppression.count({
      where: {
        workspaceId,
        revokedAt: null,
        startsAt: { lte: now },
        AND: [
          { OR: [{ channel: null }, { channel: "EMAIL" }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
    }),
  ]);

  const statusCounts = (rows: Array<{ status: string; _count: { _all: number } }>) =>
    rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});

  const analyticsByType = analytics.reduce<Record<string, number>>((acc, row) => {
    acc[row.eventType] = row._count._all;
    return acc;
  }, {});
  const trackingEvidenceCount = ["OPENED", "CLICKED", "DELIVERED"]
    .reduce((sum, eventType) => sum + (analyticsByType[eventType] || 0), 0);

  const checks = {
    workspacePresent: Boolean(workspace),
    safeRuntime: runtimeMode === "DRY_RUN" && runtimeEnabled && automationEnabled && !externalWritesEnabled,
    approvedTemplatePresent: approvedTemplates > 0,
    trackingEnabled,
    trackingEvidencePresent: trackingEvidenceCount > 0,
    noCampaignRecipientFailures: campaignRecipientsFailed === 0,
    noSequenceEnrollmentFailures: sequenceEnrollmentsFailed === 0,
    noDeadLetters: automationFailed === 0,
  };

  const blockers: string[] = [];
  if (!checks.workspacePresent) blockers.push("Activation workspace is missing.");
  if (!checks.safeRuntime) blockers.push("Email runtime is not in protected DRY_RUN automation mode.");
  if (!checks.approvedTemplatePresent) blockers.push("No approved email template is available.");
  if (!checks.trackingEnabled) blockers.push("EMAIL_TRACKING_ENABLED must be true for E7 production readiness.");
  if (!checks.trackingEvidencePresent) blockers.push("No OPENED, CLICKED, or DELIVERED tracking evidence exists in the last 30 days.");
  if (!checks.noCampaignRecipientFailures) blockers.push(`Email campaigns have ${campaignRecipientsFailed} FAILED recipient(s).`);
  if (!checks.noSequenceEnrollmentFailures) blockers.push(`Email sequences have ${sequenceEnrollmentsFailed} FAILED enrollment(s).`);
  if (!checks.noDeadLetters) blockers.push(`Email automation has ${automationFailed} dead-lettered FAILED event(s).`);

  const output = {
    status: blockers.length ? "BLOCKED" : "READY",
    workspaceId,
    runtime: {
      mode: runtimeMode,
      runtimeEnabled,
      automationEnabled,
      externalWritesEnabled,
      trackingEnabled,
    },
    checks,
    campaigns: {
      total: campaignTotal,
      byStatus: statusCounts(campaignStatusRows),
      failedRecipients: campaignRecipientsFailed,
    },
    sequences: {
      total: sequenceTotal,
      byStatus: statusCounts(sequenceStatusRows),
      failedEnrollments: sequenceEnrollmentsFailed,
    },
    automationQueue: {
      pending: automationPending,
      failed: automationFailed,
    },
    deliverability: {
      analyticsLast30dByType: analyticsByType,
      trackingEvidenceCount,
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
