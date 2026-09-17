import { execFileSync } from "node:child_process";

import { prisma } from "@/lib/db/prisma";
import { evaluateControlledLaunchPromotion } from "@/modules/release/application/controlled-launch";
import { deriveStage2GovernanceEvidence } from "@/modules/release/application/phase17-stage2-governance-evidence";
import { prismaControlledLaunchStateRepository } from "@/modules/release/infrastructure/prisma-controlled-launch-state-repository";

const WORKSPACE_ID = process.env.PHASE17_WORKSPACE_ID?.trim() || "engagews_default";
const EXPECTED_STAGE = "ONE_CONNECTED_ACCOUNT";
const EXPECTED_MODE = "SHADOW";
const EXPECTED_POLICY = "NO_EXTERNAL_WRITES";

function currentGitSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function evidenceObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const evidence = (value as Record<string, unknown>).evidence;
  return evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? (evidence as Record<string, unknown>)
    : {};
}
async function main() {
  const expectedLiveSha = process.env.PHASE17_EXPECTED_LIVE_SHA?.trim() || "";
  const liveSha = currentGitSha();
  if (!expectedLiveSha || liveSha !== expectedLiveSha) {
    throw new Error(`Live SHA mismatch: expected ${expectedLiveSha || "missing"}, got ${liveSha}.`);
  }

  const current = await prismaControlledLaunchStateRepository.getState(WORKSPACE_ID);
  if (!current) throw new Error("Controlled launch state is missing.");
  if (
    current.stage !== EXPECTED_STAGE ||
    current.mode !== EXPECTED_MODE ||
    current.writePolicy !== EXPECTED_POLICY ||
    current.externalWritesAllowed ||
    current.version !== 2
  ) {
    throw new Error("Current state is not the exact ONE_CONNECTED_ACCOUNT SHADOW version-2 baseline.");
  }
  if (current.scope.connectedAccountIds.length !== 1) {
    throw new Error("Current scope must contain exactly one connected account.");
  }

  const candidateId = current.scope.connectedAccountIds[0];
  const candidate = await prisma.engageChannelConnection.findFirst({
    where: { id: candidateId, workspaceId: WORKSPACE_ID },
    select: { id: true, channel: true, status: true, capabilities: true },
  });
  if (!candidate || candidate.status !== "CONNECTED") {
    throw new Error("Scoped connected account is not CONNECTED.");
  }

  const providerEvidence = evidenceObject(candidate.capabilities);
  const permissionsVerified =
    typeof providerEvidence.apiVerifiedAt === "string" &&
    Boolean(providerEvidence.apiVerifiedAt) &&
    typeof providerEvidence.webhookVerifiedAt === "string" &&
    Boolean(providerEvidence.webhookVerifiedAt) &&
    providerEvidence.permissionsVerified === true;

  const activeKillSwitches = await prisma.engageKillSwitch.count({
    where: { workspaceId: WORKSPACE_ID, active: true },
  });
  const auditEvents = await prisma.engageSecurityAuditEvent.findMany({
    where: { workspaceId: WORKSPACE_ID },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 500,
    select: {
      action: true, outcome: true, metadata: true, entityType: true,
      entityId: true, reasonCode: true, actorId: true, requestId: true,
    },
  });

  const evidence = deriveStage2GovernanceEvidence({
    liveSha,
    candidateId,
    exactShaVerified: true,
    permissionsVerified,
    emergencyStopActive: activeKillSwitches > 0,
    events: auditEvents,
  });
  const approvalEngineVerified =
    process.env.PHASE17_APPROVAL_ENGINE_PROOF?.trim() ===
    "G2_EXACT_MESSAGE_APPROVAL_FAIL_CLOSED_VERIFIED";
  const approvalEvidence = { ...evidence, humanApprovalEnforced: approvalEngineVerified };

  const targetScope = {
    ...current.scope,
    externalWritesRequested: true,
  };
  const decision = evaluateControlledLaunchPromotion({
    currentStage: current.stage,
    currentMode: current.mode,
    targetStage: "ONE_CONNECTED_ACCOUNT",
    targetMode: "APPROVAL_ONLY",
    scope: targetScope,
    evidence: approvalEvidence,
  });

  const queuedOutbound = await prisma.whatsAppMessage.count({
    where: { direction: "OUTBOUND", status: "QUEUED" },
  });
  const approvalRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "EngageControlledLaunchOutboundApproval"
    WHERE "workspaceId" = ${WORKSPACE_ID}
      AND "consumedAt" IS NULL
      AND "revokedAt" IS NULL
      AND "expiresAt" > CURRENT_TIMESTAMP
  `;
  const activeApprovals = approvalRows[0] ? Number(approvalRows[0].count) : 0;

  console.log(`PHASE17_APPROVAL_READINESS_LIVE_SHA=${liveSha}`);
  console.log(`CURRENT_STATE=${current.stage}|${current.mode}|${current.writePolicy}|${current.externalWritesAllowed}|${current.version}`);
  console.log(`SCOPED_CONNECTED_ACCOUNT_COUNT=${current.scope.connectedAccountIds.length}`);
  console.log(`SCOPED_CHANNEL=${candidate.channel.toLowerCase()}`);
  console.log(`PROVIDER_CONNECTION_STATUS=${candidate.status}`);
  console.log(`PERMISSIONS_VERIFIED=${permissionsVerified}`);
  console.log(`G2_APPROVAL_ENGINE_VERIFIED=${approvalEngineVerified}`);
  console.log(`QUEUED_OUTBOUND_MESSAGES=${queuedOutbound}`);
  console.log(`ACTIVE_EXACT_MESSAGE_APPROVALS=${activeApprovals}`);
  console.log(`EVIDENCE_buildVerified=${approvalEvidence.buildVerified}`);
  console.log(`EVIDENCE_rollbackTested=${approvalEvidence.rollbackTested}`);
  console.log(`EVIDENCE_monitoringActive=${approvalEvidence.monitoringActive}`);
  console.log(`EVIDENCE_policyVerified=${approvalEvidence.policyVerified}`);
  console.log(`EVIDENCE_unresolvedCriticalIncidents=${approvalEvidence.unresolvedCriticalIncidents}`);
  console.log(`EVIDENCE_unexplainedDuplicateSends=${approvalEvidence.unexplainedDuplicateSends}`);
  console.log(`EVIDENCE_scopeApproved=${approvalEvidence.scopeApproved}`);
  console.log(`EVIDENCE_smokeTestVerified=${approvalEvidence.smokeTestVerified}`);
  console.log(`EVIDENCE_supportRunbookActive=${approvalEvidence.supportRunbookActive}`);
  console.log(`EVIDENCE_observationWindowComplete=${approvalEvidence.observationWindowComplete}`);
  console.log(`EVIDENCE_humanApprovalEnforced=${approvalEvidence.humanApprovalEnforced}`);
  console.log(`TARGET=ONE_CONNECTED_ACCOUNT|APPROVAL_ONLY|HUMAN_APPROVAL_REQUIRED`);
  console.log(`TARGET_EXTERNAL_WRITES_REQUESTED=true`);
  console.log(`APPROVAL_ONLY_DRYRUN_ALLOWED=${decision.allowed}`);
  console.log(`APPROVAL_ONLY_DRYRUN_RESULT=${decision.allowed ? "PASS" : decision.reason}`);
  console.log("STATE_MUTATED=false");
  console.log("EXTERNAL_WRITE_SENT=false");
  console.log("PASS: PHASE17_APPROVAL_ONLY_READINESS_AUDIT");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
