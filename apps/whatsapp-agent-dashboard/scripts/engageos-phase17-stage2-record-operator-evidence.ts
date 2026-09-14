import { execFileSync } from "node:child_process";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  STAGE2_GOVERNANCE_ENTITY_TYPE,
  STAGE2_OPERATOR_REASON_CODE,
} from "@/modules/release/application/phase17-stage2-governance-evidence";
import {
  STAGE2_OPERATOR_ATTESTATION_PHRASE,
  STAGE2_OPERATOR_EVIDENCE_COMMIT_PHRASE,
  validateStage2OperatorEvidenceInput,
} from "@/modules/release/application/phase17-stage2-operator-evidence-input";

const WORKSPACE_ID = process.env.PHASE17_WORKSPACE_ID?.trim() || "engagews_default";

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

function metadataEqualsExpected(
  actual: unknown,
  expected: Record<string, unknown>,
): boolean {
  const object = metadataObject(actual);
  return Object.entries(expected).every(([key, value]) => object[key] === value);
}

async function main() {
  const expectedLiveSha = required("PHASE17_EXPECTED_LIVE_SHA");
  const commitRequested =
    process.env.PHASE17_OPERATOR_EVIDENCE_COMMIT?.trim() === STAGE2_OPERATOR_EVIDENCE_COMMIT_PHRASE;
  const commitValue = process.env.PHASE17_OPERATOR_EVIDENCE_COMMIT?.trim() || "";
  const attestation = process.env.PHASE17_OPERATOR_ATTESTATION?.trim() || "";

  if (commitValue && !commitRequested) {
    throw new Error("PHASE17_OPERATOR_EVIDENCE_COMMIT does not match the required commit phrase.");
  }
  if (commitRequested && attestation !== STAGE2_OPERATOR_ATTESTATION_PHRASE) {
    throw new Error("Exact human attestation phrase is required before operator evidence can be committed.");
  }

  const liveSha = currentGitSha();
  if (liveSha !== expectedLiveSha) {
    throw new Error(`Live SHA mismatch: expected ${expectedLiveSha}, got ${liveSha}.`);
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
      version: true,
    },
  });
  const transitionCount = await prisma.engageControlledLaunchTransition.count({
    where: { workspaceId: WORKSPACE_ID },
  });

  if (
    !state ||
    state.stage !== "INTERNAL_TEST_IDENTITIES" ||
    state.mode !== "SHADOW" ||
    state.writePolicy !== "NO_EXTERNAL_WRITES" ||
    state.externalWritesAllowed ||
    state.version !== 1 ||
    transitionCount !== 1
  ) {
    throw new Error("Operator evidence recorder requires the exact Stage1 SHADOW version-1 baseline.");
  }

  const action = required("PHASE17_OPERATOR_EVIDENCE_ACTION");
  const expectedCandidateId =
    action === "PHASE17_STAGE2_SCOPE_APPROVED"
      ? required("PHASE17_STAGE2_CANDIDATE_ID")
      : process.env.PHASE17_STAGE2_CANDIDATE_ID?.trim() || null;

  const evidence = validateStage2OperatorEvidenceInput({
    action,
    liveSha: expectedLiveSha,
    actorId: required("PHASE17_OPERATOR_ACTOR_ID"),
    proofRef: required("PHASE17_OPERATOR_PROOF_REF"),
    verifiedAt: required("PHASE17_OPERATOR_VERIFIED_AT"),
    requestId: required("PHASE17_OPERATOR_REQUEST_ID"),
    metadataJson: required("PHASE17_OPERATOR_METADATA_JSON"),
    expectedCandidateId,
  });

  const membership = await prisma.engageWorkspaceMembership.findFirst({
    where: {
      workspaceId: WORKSPACE_ID,
      userId: evidence.actorId,
      isActive: true,
      user: { isActive: true },
    },
    select: {
      id: true,
      role: true,
    },
  });
  if (!membership) {
    throw new Error("PHASE17_OPERATOR_ACTOR_ID must identify an active user with an active workspace membership.");
  }

  const existingRequest = await prisma.engageSecurityAuditEvent.findFirst({
    where: {
      workspaceId: WORKSPACE_ID,
      requestId: evidence.requestId,
    },
    select: {
      id: true,
      action: true,
      outcome: true,
      entityType: true,
      entityId: true,
      reasonCode: true,
      actorId: true,
      metadata: true,
    },
  });

  if (existingRequest) {
    const exactExisting =
      existingRequest.action === evidence.action &&
      existingRequest.outcome === "VERIFIED" &&
      existingRequest.entityType === STAGE2_GOVERNANCE_ENTITY_TYPE &&
      existingRequest.entityId === evidence.liveSha &&
      existingRequest.reasonCode === STAGE2_OPERATOR_REASON_CODE &&
      existingRequest.actorId === evidence.actorId &&
      metadataEqualsExpected(existingRequest.metadata, evidence.metadata);

    if (!exactExisting) {
      throw new Error("PHASE17_OPERATOR_REQUEST_ID already exists with different evidence; refusing collision.");
    }

    console.log("PHASE17_OPERATOR_EVIDENCE_MODE=IDEMPOTENT_EXISTING");
    console.log(`PHASE17_OPERATOR_EVIDENCE_ACTION=${evidence.action}`);
    console.log(`PHASE17_OPERATOR_EVIDENCE_LIVE_SHA=${evidence.liveSha}`);
    console.log("PHASE17_OPERATOR_EVIDENCE_ACTOR_ID_VERIFIED=true");
    console.log(`PHASE17_OPERATOR_EVIDENCE_ACTOR_ROLE=${membership.role}`);
    console.log("PASS: PHASE17_OPERATOR_EVIDENCE_ALREADY_RECORDED_EXACTLY");
    return;
  }

  console.log(`PHASE17_OPERATOR_EVIDENCE_MODE=${commitRequested ? "COMMIT" : "DRY_RUN"}`);
  console.log(`PHASE17_OPERATOR_EVIDENCE_ACTION=${evidence.action}`);
  console.log(`PHASE17_OPERATOR_EVIDENCE_LIVE_SHA=${evidence.liveSha}`);
  console.log("PHASE17_OPERATOR_EVIDENCE_ACTOR_ID_VERIFIED=true");
  console.log(`PHASE17_OPERATOR_EVIDENCE_ACTOR_ROLE=${membership.role}`);
  console.log("PHASE17_OPERATOR_EVIDENCE_PROOF_REF_PRESENT=true");
  console.log(`PHASE17_OPERATOR_EVIDENCE_VERIFIED_AT=${evidence.verifiedAt}`);
  console.log("PHASE17_OPERATOR_EVIDENCE_REQUEST_ID_PRESENT=true");
  console.log(`PHASE17_OPERATOR_EVIDENCE_METADATA_KEYS=${Object.keys(evidence.gateMetadata).sort().join(",")}`);
  console.log(`PHASE17_OPERATOR_EVIDENCE_STAGE1_VERSION=${state.version}`);
  console.log(`PHASE17_OPERATOR_EVIDENCE_TRANSITION_COUNT=${transitionCount}`);

  if (!commitRequested) {
    console.log("PASS: PHASE17_OPERATOR_EVIDENCE_DRY_RUN_NO_MUTATION");
    return;
  }

  const created = await prisma.engageSecurityAuditEvent.create({
    data: {
      workspaceId: WORKSPACE_ID,
      actorId: evidence.actorId,
      action: evidence.action,
      outcome: "VERIFIED",
      entityType: STAGE2_GOVERNANCE_ENTITY_TYPE,
      entityId: evidence.liveSha,
      reasonCode: STAGE2_OPERATOR_REASON_CODE,
      requestId: evidence.requestId,
      correlationId: `phase17-stage2-operator:${evidence.liveSha}`,
      metadata: evidence.metadata as Prisma.InputJsonObject,
      occurredAt: new Date(evidence.verifiedAt),
    },
    select: { id: true },
  });

  const post = await prisma.engageSecurityAuditEvent.findUnique({
    where: { id: created.id },
    select: {
      action: true,
      outcome: true,
      entityType: true,
      entityId: true,
      reasonCode: true,
      requestId: true,
      actorId: true,
      metadata: true,
    },
  });

  if (
    !post ||
    post.action !== evidence.action ||
    post.outcome !== "VERIFIED" ||
    post.entityType !== STAGE2_GOVERNANCE_ENTITY_TYPE ||
    post.entityId !== evidence.liveSha ||
    post.reasonCode !== STAGE2_OPERATOR_REASON_CODE ||
    post.requestId !== evidence.requestId ||
    post.actorId !== evidence.actorId ||
    !metadataEqualsExpected(post.metadata, evidence.metadata)
  ) {
    throw new Error("Post-write verification failed for operator evidence.");
  }

  console.log("PASS: PHASE17_OPERATOR_EVIDENCE_RECORDED_EXACT_SHA");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
