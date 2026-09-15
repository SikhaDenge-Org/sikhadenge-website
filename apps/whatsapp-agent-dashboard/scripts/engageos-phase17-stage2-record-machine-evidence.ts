import { execFileSync } from "node:child_process";

import { prisma } from "@/lib/db/prisma";
import { STAGE2_GOVERNANCE_ACTIONS } from "@/modules/release/application/phase17-stage2-governance-evidence";

const WORKSPACE_ID = process.env.PHASE17_WORKSPACE_ID?.trim() || "engagews_default";
const APPLY_PHRASE = "RECORD_MACHINE_VERIFIED_EVIDENCE";
const ENTITY_TYPE = "CONTROLLED_LAUNCH_GOVERNANCE";

const POLICY_CHECKS = [
  "typecheck",
  "phase17-controlled-launch",
  "phase17-production-readiness",
  "stage2-governance-evidence",
  "stage2-machine-evidence-policy",
] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function currentGitSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function trackedWorktreeIsClean(): boolean {
  return execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim() === "";
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

async function main() {
  const expectedLiveSha = required("PHASE17_EXPECTED_LIVE_SHA");
  const productionRunId = required("PHASE17_PRODUCTION_RUN_ID");
  const productionRunNumber = required("PHASE17_PRODUCTION_RUN_NUMBER");
  const policyRunId = required("PHASE17_POLICY_RUN_ID");
  const policyCommitSha = required("PHASE17_POLICY_COMMIT_SHA");
  const commit = process.env.PHASE17_MACHINE_EVIDENCE_COMMIT?.trim() === APPLY_PHRASE;

  const liveSha = currentGitSha();
  if (liveSha !== expectedLiveSha) {
    throw new Error(`Live SHA mismatch: expected ${expectedLiveSha}, got ${liveSha}.`);
  }
  if (policyCommitSha !== liveSha) {
    throw new Error(`Policy SHA mismatch: expected live ${liveSha}, got ${policyCommitSha}.`);
  }
  if (!trackedWorktreeIsClean()) {
    throw new Error("Tracked production worktree is not clean.");
  }

  const state = await prisma.engageControlledLaunchState.findUnique({
    where: { workspaceId: WORKSPACE_ID },
    select: {
      stage: true,
      mode: true,
      writePolicy: true,
      externalWritesAllowed: true,
      scope: true,
      version: true,
    },
  });
  const transitionCount = await prisma.engageControlledLaunchTransition.count({
    where: { workspaceId: WORKSPACE_ID },
  });

  if (!state) {
    throw new Error("Machine evidence recorder requires persisted controlled-launch state.");
  }

  const scope = metadataObject(state.scope);
  const connectedAccountIds = stringArray(scope.connectedAccountIds);
  const instagramAssetIds = stringArray(scope.instagramAssetIds);
  const automationIds = stringArray(scope.automationIds);
  const counselorGroupIds = stringArray(scope.counselorGroupIds);
  const enabledChannels = stringArray(scope.enabledChannels);

  const safeStage1 =
    state.stage === "INTERNAL_TEST_IDENTITIES" &&
    state.mode === "SHADOW" &&
    state.writePolicy === "NO_EXTERNAL_WRITES" &&
    !state.externalWritesAllowed &&
    state.version === 1 &&
    transitionCount === 1 &&
    Number(scope.maxRealLeads) === 0 &&
    scope.externalWritesRequested === false &&
    connectedAccountIds.length === 0 &&
    instagramAssetIds.length === 0 &&
    automationIds.length === 0 &&
    counselorGroupIds.length === 0 &&
    enabledChannels.length === 0;

  const safeStage2 =
    state.stage === "ONE_CONNECTED_ACCOUNT" &&
    state.mode === "SHADOW" &&
    state.writePolicy === "NO_EXTERNAL_WRITES" &&
    !state.externalWritesAllowed &&
    state.version === 2 &&
    transitionCount === 2 &&
    Number(scope.maxRealLeads) === 0 &&
    scope.externalWritesRequested === false &&
    connectedAccountIds.length === 1 &&
    instagramAssetIds.length === 0 &&
    automationIds.length === 0 &&
    counselorGroupIds.length === 0 &&
    enabledChannels.length === 1 &&
    enabledChannels[0] === "whatsapp";

  if (!safeStage1 && !safeStage2) {
    throw new Error("Machine evidence recorder requires the exact safe Stage1 or Stage2 SHADOW state.");
  }

  if (safeStage2) {
    const candidate = await prisma.engageChannelConnection.findFirst({
      where: { id: connectedAccountIds[0], workspaceId: WORKSPACE_ID },
      select: { channel: true, status: true, capabilities: true },
    });
    const capabilities = metadataObject(candidate?.capabilities);
    const evidence = metadataObject(capabilities.evidence);
    if (
      !candidate ||
      candidate.channel !== "WHATSAPP" ||
      candidate.status !== "CONNECTED" ||
      evidence.permissionsVerified !== true ||
      typeof evidence.apiVerifiedAt !== "string" ||
      !evidence.apiVerifiedAt ||
      typeof evidence.webhookVerifiedAt !== "string" ||
      !evidence.webhookVerifiedAt
    ) {
      throw new Error("Machine evidence recorder requires the exact verified Stage2 WhatsApp connection.");
    }
  }

  const correlationId = `phase17-stage2:${liveSha}`;
  const now = new Date();
  const records = [
    {
      action: STAGE2_GOVERNANCE_ACTIONS.productionEvidence,
      metadata: {
        liveSha,
        source: "github-actions-production-batch1-plus-postdeploy-proof",
        productionRunId,
        productionRunNumber,
        productionWorkflowConclusion: "success",
        exactLiveShaVerified: true,
        trackedWorktreeClean: true,
        processHealthVerified: true,
        loginSmokeVerified: true,
      },
    },
    {
      action: STAGE2_GOVERNANCE_ACTIONS.policyVerified,
      metadata: {
        liveSha,
        source: "github-actions-phase17-stage2-machine-evidence",
        policyRunId,
        policyCommitSha,
        checks: [...POLICY_CHECKS],
      },
    },
  ] as const;

  console.log(`PHASE17_MACHINE_EVIDENCE_MODE=${commit ? "COMMIT" : "DRY_RUN"}`);
  console.log(`PHASE17_MACHINE_EVIDENCE_LIVE_SHA=${liveSha}`);
  console.log(`PHASE17_MACHINE_EVIDENCE_STAGE=${state.stage}`);
  console.log(`PHASE17_MACHINE_EVIDENCE_VERSION=${state.version}`);
  console.log(`PHASE17_MACHINE_EVIDENCE_TRANSITION_COUNT=${transitionCount}`);
  console.log(`PHASE17_MACHINE_EVIDENCE_ALLOWED_ACTIONS=${records.map((record) => record.action).join(",")}`);

  const existing = await prisma.engageSecurityAuditEvent.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      action: { in: records.map((record) => record.action) },
      outcome: "VERIFIED",
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: { action: true, metadata: true },
  });

  const alreadyRecorded = (action: string) =>
    existing.some((event) => event.action === action && metadataObject(event.metadata).liveSha === liveSha);

  for (const record of records) {
    if (alreadyRecorded(record.action)) {
      console.log(`PHASE17_MACHINE_EVIDENCE_${record.action}=ALREADY_RECORDED`);
      continue;
    }
    if (!commit) {
      console.log(`PHASE17_MACHINE_EVIDENCE_${record.action}=WOULD_RECORD`);
      continue;
    }

    await prisma.engageSecurityAuditEvent.create({
      data: {
        workspaceId: WORKSPACE_ID,
        actorId: null,
        action: record.action,
        outcome: "VERIFIED",
        entityType: ENTITY_TYPE,
        entityId: liveSha,
        reasonCode: "MACHINE_VERIFIED_EXACT_SHA",
        requestId: `github-actions:${policyRunId}:${record.action}`,
        correlationId,
        metadata: record.metadata,
        occurredAt: now,
      },
    });
    console.log(`PHASE17_MACHINE_EVIDENCE_${record.action}=RECORDED`);
  }

  if (!commit) {
    console.log("PASS: PHASE17_MACHINE_EVIDENCE_DRY_RUN_NO_MUTATION");
    return;
  }

  const post = await prisma.engageSecurityAuditEvent.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      action: { in: records.map((record) => record.action) },
      outcome: "VERIFIED",
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: { action: true, metadata: true },
  });

  for (const record of records) {
    const proven = post.some(
      (event) => event.action === record.action && metadataObject(event.metadata).liveSha === liveSha,
    );
    if (!proven) throw new Error(`Post-write verification failed for ${record.action}.`);
  }

  console.log("PASS: PHASE17_MACHINE_EVIDENCE_RECORDED_IDEMPOTENTLY");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
