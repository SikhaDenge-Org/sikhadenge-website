import { execFileSync } from "node:child_process";

import { prisma } from "@/lib/db/prisma";
import { evaluateControlledLaunchPromotion } from "@/modules/release/application/controlled-launch";
import { deriveStage2GovernanceEvidence } from "@/modules/release/application/phase17-stage2-governance-evidence";
import { transitionControlledLaunchState } from "@/modules/release/application/controlled-launch-state";
import { prismaControlledLaunchStateRepository } from "@/modules/release/infrastructure/prisma-controlled-launch-state-repository";

const WORKSPACE_ID = process.env.PHASE17_WORKSPACE_ID?.trim() || "engagews_default";
const APPLY_PHRASE = "APPLY_ONE_CONNECTED_ACCOUNT_SHADOW";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function evidenceObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const capabilities = value as Record<string, unknown>;
  const evidence = capabilities.evidence;
  return evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? (evidence as Record<string, unknown>)
    : {};
}

function currentGitSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

async function main() {
  const candidateId = required("PHASE17_STAGE2_CONNECTED_ACCOUNT_ID");
  const expectedLiveSha = required("PHASE17_EXPECTED_LIVE_SHA");
  const expectedVersion = Number(required("PHASE17_STAGE2_EXPECTED_VERSION"));
  if (expectedVersion !== 1) throw new Error("Stage2 promotion requires expected version 1.");

  const liveSha = currentGitSha();
  if (liveSha !== expectedLiveSha) {
    throw new Error(`Live SHA mismatch: expected ${expectedLiveSha}, got ${liveSha}.`);
  }

  const current = await prismaControlledLaunchStateRepository.getState(WORKSPACE_ID);
  if (!current) throw new Error("Controlled launch state is not bootstrapped.");
  if (
    current.stage !== "INTERNAL_TEST_IDENTITIES" ||
    current.mode !== "SHADOW" ||
    current.writePolicy !== "NO_EXTERNAL_WRITES" ||
    current.externalWritesAllowed ||
    current.version !== 1
  ) {
    throw new Error("Current state is not the exact Stage1 SHADOW version-1 baseline.");
  }

  const history = await prismaControlledLaunchStateRepository.listTransitions?.(WORKSPACE_ID);
  if (!history || history.length !== 1 || history[0]?.resultingVersion !== 1) {
    throw new Error("Stage1 transition history is not the exact one-transition baseline.");
  }

  const candidate = await prisma.engageChannelConnection.findFirst({
    where: { id: candidateId, workspaceId: WORKSPACE_ID },
    select: { id: true, channel: true, status: true, capabilities: true },
  });
  if (!candidate || candidate.status !== "CONNECTED") {
    throw new Error("Stage2 candidate must exist in the active workspace and be CONNECTED.");
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
    select: { action: true, outcome: true, metadata: true },
  });

  const evidence = deriveStage2GovernanceEvidence({
    liveSha,
    candidateId: candidate.id,
    exactShaVerified: true,
    permissionsVerified,
    emergencyStopActive: activeKillSwitches > 0,
    events: auditEvents,
  });

  const scope = {
    workspaceId: WORKSPACE_ID,
    connectedAccountIds: [candidate.id],
    instagramAssetIds: [],
    automationIds: [],
    counselorGroupIds: [],
    enabledChannels: [candidate.channel.toLowerCase()],
    maxRealLeads: 0,
    externalWritesRequested: false,
  } as const;

  const decision = evaluateControlledLaunchPromotion({
    currentStage: current.stage,
    currentMode: current.mode,
    targetStage: "ONE_CONNECTED_ACCOUNT",
    targetMode: "SHADOW",
    scope,
    evidence,
  });

  const commit = process.env.PHASE17_STAGE2_COMMIT?.trim() === APPLY_PHRASE;
  console.log(`PHASE17_STAGE2_MODE=${commit ? "COMMIT" : "DRY_RUN"}`);
  console.log(`PHASE17_STAGE2_LIVE_SHA=${liveSha}`);
  console.log(`PHASE17_STAGE2_CANDIDATE_ID=${candidate.id}`);
  console.log("PHASE17_STAGE2_TARGET=ONE_CONNECTED_ACCOUNT|SHADOW|NO_EXTERNAL_WRITES");
  console.log("PHASE17_STAGE2_EXTERNAL_WRITES_REQUESTED=false");
  console.log("PHASE17_STAGE2_EVIDENCE_SOURCE=PERSISTED_SECURITY_AUDIT_EVENTS_PLUS_LIVE_CHECKS");

  if (!decision.allowed) {
    console.log("PHASE17_STAGE2_READY=false");
    throw new Error(`Stage2 governance evidence incomplete: ${decision.reason}`);
  }

  console.log("PHASE17_STAGE2_READY=true");
  if (!commit) {
    console.log("PASS: PHASE17_STAGE2_DRY_RUN_GOVERNANCE_VERIFIED");
    return;
  }

  const next = await transitionControlledLaunchState(prismaControlledLaunchStateRepository, {
    activeWorkspaceId: WORKSPACE_ID,
    workspaceId: WORKSPACE_ID,
    actorUserId: null,
    reason: "Phase17 Stage2 promotion using persisted governance attestations",
    expectedVersion,
    targetStage: "ONE_CONNECTED_ACCOUNT",
    targetMode: "SHADOW",
    scope,
    evidence,
  });

  if (
    next.stage !== "ONE_CONNECTED_ACCOUNT" ||
    next.mode !== "SHADOW" ||
    next.writePolicy !== "NO_EXTERNAL_WRITES" ||
    next.externalWritesAllowed ||
    next.version !== 2 ||
    next.scope.connectedAccountIds.length !== 1 ||
    next.scope.connectedAccountIds[0] !== candidate.id ||
    next.scope.externalWritesRequested
  ) {
    throw new Error("Stage2 persisted state failed post-transition safety verification.");
  }

  const finalHistory = await prismaControlledLaunchStateRepository.listTransitions?.(WORKSPACE_ID);
  if (!finalHistory || finalHistory.length !== 2 || finalHistory[1]?.resultingVersion !== 2) {
    throw new Error("Stage2 transition history failed post-transition verification.");
  }

  console.log("PHASE17_STAGE2_STATE=ONE_CONNECTED_ACCOUNT|SHADOW|NO_EXTERNAL_WRITES|false|2");
  console.log("PHASE17_STAGE2_TRANSITION_COUNT=2");
  console.log("PASS: PHASE17_STAGE2_ONE_CONNECTED_ACCOUNT_PROMOTED");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
