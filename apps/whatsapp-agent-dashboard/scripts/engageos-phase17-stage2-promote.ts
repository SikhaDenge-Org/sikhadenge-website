import { prisma } from "@/lib/db/prisma";
import type { ControlledLaunchEvidence } from "@/modules/release/application/controlled-launch";
import { transitionControlledLaunchState } from "@/modules/release/application/controlled-launch-state";
import { prismaControlledLaunchStateRepository } from "@/modules/release/infrastructure/prisma-controlled-launch-state-repository";

const WORKSPACE_ID = process.env.PHASE17_WORKSPACE_ID?.trim() || "engagews_default";
const APPLY_PHRASE = "APPLY_ONE_CONNECTED_ACCOUNT_SHADOW";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function bool(name: string): boolean {
  const value = required(name).toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function nonNegativeInt(name: string): number {
  const raw = required(name);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a non-negative integer.`);
  return Number(raw);
}

function evidenceFromEnvironment(): ControlledLaunchEvidence {
  return {
    exactShaVerified: bool("PHASE17_EVIDENCE_EXACT_SHA_VERIFIED"),
    buildVerified: bool("PHASE17_EVIDENCE_BUILD_VERIFIED"),
    rollbackTested: bool("PHASE17_EVIDENCE_ROLLBACK_TESTED"),
    monitoringActive: bool("PHASE17_EVIDENCE_MONITORING_ACTIVE"),
    permissionsVerified: bool("PHASE17_EVIDENCE_PERMISSIONS_VERIFIED"),
    policyVerified: bool("PHASE17_EVIDENCE_POLICY_VERIFIED"),
    unresolvedCriticalIncidents: nonNegativeInt("PHASE17_EVIDENCE_UNRESOLVED_CRITICAL_INCIDENTS"),
    unexplainedDuplicateSends: nonNegativeInt("PHASE17_EVIDENCE_UNEXPLAINED_DUPLICATE_SENDS"),
    emergencyStopActive: bool("PHASE17_EVIDENCE_EMERGENCY_STOP_ACTIVE"),
    scopeApproved: bool("PHASE17_EVIDENCE_SCOPE_APPROVED"),
    smokeTestVerified: bool("PHASE17_EVIDENCE_SMOKE_TEST_VERIFIED"),
    supportRunbookActive: bool("PHASE17_EVIDENCE_SUPPORT_RUNBOOK_ACTIVE"),
    observationWindowComplete: bool("PHASE17_EVIDENCE_OBSERVATION_WINDOW_COMPLETE"),
    humanApprovalEnforced: false,
    boundedAutopilotApproved: false,
    approvedFlowsOnlyEnforced: false,
    productionEvidenceRecorded: bool("PHASE17_EVIDENCE_PRODUCTION_RECORDED"),
  };
}

async function main() {
  const candidateId = required("PHASE17_STAGE2_CONNECTED_ACCOUNT_ID");
  const expectedVersion = Number(required("PHASE17_STAGE2_EXPECTED_VERSION"));
  if (expectedVersion !== 1) throw new Error("Stage2 promotion requires expected version 1.");

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

  const transitions = await prismaControlledLaunchStateRepository.listTransitions?.(WORKSPACE_ID);
  if (!transitions || transitions.length !== 1 || transitions[0]?.resultingVersion !== 1) {
    throw new Error("Stage1 transition history is not the exact one-transition baseline.");
  }

  const candidate = await prisma.engageChannelConnection.findFirst({
    where: { id: candidateId, workspaceId: WORKSPACE_ID },
    select: { id: true, channel: true, status: true, externalAccountId: true },
  });
  if (!candidate) throw new Error("Stage2 connected-account candidate was not found in the active workspace.");
  if (candidate.status !== "CONNECTED") {
    throw new Error(`Stage2 candidate is not CONNECTED (status=${candidate.status}).`);
  }

  const evidence = evidenceFromEnvironment();
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

  const dryRun = process.env.PHASE17_STAGE2_COMMIT?.trim() !== APPLY_PHRASE;
  if (dryRun) {
    console.log("PHASE17_STAGE2_MODE=DRY_RUN");
    console.log(`PHASE17_STAGE2_WORKSPACE=${WORKSPACE_ID}`);
    console.log(`PHASE17_STAGE2_CANDIDATE_ID=${candidate.id}`);
    console.log(`PHASE17_STAGE2_CANDIDATE_CHANNEL=${candidate.channel}`);
    console.log(`PHASE17_STAGE2_CANDIDATE_STATUS=${candidate.status}`);
    console.log("PHASE17_STAGE2_TARGET=ONE_CONNECTED_ACCOUNT|SHADOW|NO_EXTERNAL_WRITES");
    console.log("PHASE17_STAGE2_EXTERNAL_WRITES_REQUESTED=false");
    console.log("PHASE17_STAGE2_EXTERNAL_WRITES_ALLOWED=false");
    console.log("PASS: PHASE17_STAGE2_DRY_RUN_GUARDS_VERIFIED");
    return;
  }

  const next = await transitionControlledLaunchState(prismaControlledLaunchStateRepository, {
    activeWorkspaceId: WORKSPACE_ID,
    workspaceId: WORKSPACE_ID,
    actorUserId: null,
    reason: "Phase17 Stage2 controlled promotion to one connected account in SHADOW mode",
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

  const history = await prismaControlledLaunchStateRepository.listTransitions?.(WORKSPACE_ID);
  if (!history || history.length !== 2 || history[1]?.resultingVersion !== 2) {
    throw new Error("Stage2 transition history failed post-transition verification.");
  }

  console.log("PHASE17_STAGE2_MODE=COMMIT");
  console.log(`PHASE17_STAGE2_WORKSPACE=${WORKSPACE_ID}`);
  console.log(`PHASE17_STAGE2_CANDIDATE_ID=${candidate.id}`);
  console.log(`PHASE17_STAGE2_CANDIDATE_CHANNEL=${candidate.channel}`);
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
