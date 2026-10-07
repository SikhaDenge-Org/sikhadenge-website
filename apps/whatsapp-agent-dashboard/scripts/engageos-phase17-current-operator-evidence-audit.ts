import { execFileSync } from "node:child_process";

import { prisma } from "@/lib/db/prisma";
import { deriveStage2GovernanceEvidence } from "@/modules/release/application/phase17-stage2-governance-evidence";

const WORKSPACE_ID = process.env.PHASE17_WORKSPACE_ID?.trim() || "engagews_default";

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

function emit(key: string, proven: boolean) {
  console.log(`${key}=${proven ? "PROVEN" : "UNPROVEN"}`);
}

async function main() {
  const expectedLiveSha = required("PHASE17_EXPECTED_LIVE_SHA");
  const liveSha = currentGitSha();
  if (liveSha !== expectedLiveSha) {
    throw new Error(`Live SHA mismatch: expected ${expectedLiveSha}, got ${liveSha}.`);
  }

  const candidate = await prisma.engageChannelConnection.findFirst({
    where: {
      workspaceId: WORKSPACE_ID,
      channel: "WHATSAPP",
      status: "CONNECTED",
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, capabilities: true },
  });
  if (!candidate) {
    throw new Error("No CONNECTED WhatsApp candidate exists in the active workspace.");
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

  const events = await prisma.engageSecurityAuditEvent.findMany({
    where: { workspaceId: WORKSPACE_ID },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 500,
    select: {
      action: true,
      outcome: true,
      metadata: true,
      entityType: true,
      entityId: true,
      reasonCode: true,
      actorId: true,
      requestId: true,
    },
  });

  const evidence = deriveStage2GovernanceEvidence({
    liveSha,
    candidateId: candidate.id,
    exactShaVerified: true,
    permissionsVerified,
    emergencyStopActive: activeKillSwitches > 0,
    events,
  });

  console.log(`LIVE_SHA=${liveSha}`);
  console.log(`CURRENT_WHATSAPP_CANDIDATE_ID=${candidate.id}`);
  console.log(`PERMISSIONS_VERIFIED=${permissionsVerified}`);
  console.log(`ACTIVE_KILL_SWITCHES=${activeKillSwitches}`);

  emit("PHASE17_CRITICAL_INCIDENT_REVIEW", evidence.unresolvedCriticalIncidents === 0);
  emit("PHASE17_DUPLICATE_SEND_REVIEW", evidence.unexplainedDuplicateSends === 0);
  emit("PHASE17_ROLLBACK_REHEARSAL", evidence.rollbackTested);
  emit("PHASE17_MONITORING_ACTIVE", evidence.monitoringActive);
  emit("PHASE17_STAGE2_SCOPE_APPROVED", evidence.scopeApproved);
  emit("PHASE17_AUTHENTICATED_SMOKE", evidence.smokeTestVerified);
  emit("PHASE17_SUPPORT_RUNBOOK_ACTIVE", evidence.supportRunbookActive);
  emit("PHASE17_OBSERVATION_WINDOW_COMPLETE", evidence.observationWindowComplete);
  emit("PHASE17_PRODUCTION_EVIDENCE_RECORDED", evidence.productionEvidenceRecorded);
  emit("PHASE17_POLICY_VERIFIED", evidence.policyVerified);

  const operatorGates = [
    evidence.unresolvedCriticalIncidents === 0,
    evidence.unexplainedDuplicateSends === 0,
    evidence.rollbackTested,
    evidence.monitoringActive,
    evidence.scopeApproved,
    evidence.smokeTestVerified,
    evidence.supportRunbookActive,
    evidence.observationWindowComplete,
  ].filter(Boolean).length;

  const machineGates = [
    evidence.productionEvidenceRecorded,
    evidence.policyVerified,
  ].filter(Boolean).length;

  console.log(`OPERATOR_GATES_PROVEN=${operatorGates}/8`);
  console.log(`MACHINE_GATES_PROVEN=${machineGates}/2`);
  console.log("EXTERNAL_WRITE_SENT=false");
  console.log("PASS: PHASE17_CURRENT_OPERATOR_EVIDENCE_CANONICAL_READONLY_AUDIT");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
