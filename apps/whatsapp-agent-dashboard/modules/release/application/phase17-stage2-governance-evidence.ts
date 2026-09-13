import type { ControlledLaunchEvidence } from "@/modules/release/application/controlled-launch";

export const STAGE2_GOVERNANCE_ACTIONS = {
  productionEvidence: "PHASE17_PRODUCTION_EVIDENCE_RECORDED",
  rollbackRehearsal: "PHASE17_ROLLBACK_REHEARSAL",
  monitoringActive: "PHASE17_MONITORING_ACTIVE",
  policyVerified: "PHASE17_POLICY_VERIFIED",
  criticalIncidentReview: "PHASE17_CRITICAL_INCIDENT_REVIEW",
  duplicateSendReview: "PHASE17_DUPLICATE_SEND_REVIEW",
  scopeApproved: "PHASE17_STAGE2_SCOPE_APPROVED",
  authenticatedSmoke: "PHASE17_AUTHENTICATED_SMOKE",
  supportRunbookActive: "PHASE17_SUPPORT_RUNBOOK_ACTIVE",
  observationWindowComplete: "PHASE17_OBSERVATION_WINDOW_COMPLETE",
} as const;

export const STAGE2_GOVERNANCE_ENTITY_TYPE = "CONTROLLED_LAUNCH_GOVERNANCE";
export const STAGE2_MACHINE_REASON_CODE = "MACHINE_VERIFIED_EXACT_SHA";
export const STAGE2_OPERATOR_REASON_CODE = "OPERATOR_VERIFIED_EXACT_SHA";

const REQUIRED_POLICY_CHECKS = [
  "typecheck",
  "phase17-controlled-launch",
  "phase17-production-readiness",
  "stage2-governance-evidence",
  "stage2-machine-evidence-policy",
] as const;

type AuditEvent = {
  action: string;
  outcome: string;
  metadata: unknown;
  entityType?: string | null;
  entityId?: string | null;
  reasonCode?: string | null;
  actorId?: string | null;
  requestId?: string | null;
};

type Metadata = Record<string, unknown>;

function metadataOf(event: AuditEvent | undefined): Metadata {
  return event?.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
    ? (event.metadata as Metadata)
    : {};
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function zeroMetadataCount(metadata: Metadata, key: string): boolean {
  const value = metadata[key];
  return value === 0 || value === "0";
}

function zeroEventCount(event: AuditEvent | undefined, key: string): boolean {
  return zeroMetadataCount(metadataOf(event), key);
}

function boundVerifiedForSha(event: AuditEvent, action: string, liveSha: string): boolean {
  const metadata = metadataOf(event);
  return (
    event.action === action &&
    event.outcome === "VERIFIED" &&
    event.entityType === STAGE2_GOVERNANCE_ENTITY_TYPE &&
    event.entityId === liveSha &&
    nonEmptyString(event.requestId) &&
    metadata.liveSha === liveSha
  );
}

function machineVerifiedForSha(
  events: readonly AuditEvent[],
  action: string,
  liveSha: string,
  metadataProof: (metadata: Metadata) => boolean,
): AuditEvent | undefined {
  return events.find((event) => {
    if (!boundVerifiedForSha(event, action, liveSha)) return false;
    if (event.reasonCode !== STAGE2_MACHINE_REASON_CODE || event.actorId !== null) return false;
    return metadataProof(metadataOf(event));
  });
}

function operatorVerifiedForSha(
  events: readonly AuditEvent[],
  action: string,
  liveSha: string,
  metadataProof: (metadata: Metadata) => boolean,
): AuditEvent | undefined {
  return events.find((event) => {
    if (!boundVerifiedForSha(event, action, liveSha)) return false;
    if (event.reasonCode !== STAGE2_OPERATOR_REASON_CODE || !nonEmptyString(event.actorId)) return false;
    const metadata = metadataOf(event);
    if (!nonEmptyString(metadata.proofRef) || !validTimestamp(metadata.verifiedAt)) return false;
    return metadataProof(metadata);
  });
}

function productionEvidence(
  events: readonly AuditEvent[],
  liveSha: string,
): AuditEvent | undefined {
  return machineVerifiedForSha(events, STAGE2_GOVERNANCE_ACTIONS.productionEvidence, liveSha, (metadata) =>
    metadata.source === "github-actions-production-batch1-plus-postdeploy-proof" &&
    nonEmptyString(metadata.productionRunId) &&
    nonEmptyString(metadata.productionRunNumber) &&
    metadata.productionWorkflowConclusion === "success" &&
    metadata.exactLiveShaVerified === true &&
    metadata.trackedWorktreeClean === true &&
    metadata.processHealthVerified === true &&
    metadata.loginSmokeVerified === true,
  );
}

function policyEvidence(
  events: readonly AuditEvent[],
  liveSha: string,
): AuditEvent | undefined {
  return machineVerifiedForSha(events, STAGE2_GOVERNANCE_ACTIONS.policyVerified, liveSha, (metadata) => {
    if (
      metadata.source !== "github-actions-phase17-stage2-machine-evidence" ||
      !nonEmptyString(metadata.policyRunId) ||
      metadata.policyCommitSha !== liveSha ||
      !Array.isArray(metadata.checks)
    ) {
      return false;
    }
    return REQUIRED_POLICY_CHECKS.every((check) => metadata.checks.includes(check));
  });
}

function operatorPassEvidence(
  events: readonly AuditEvent[],
  action: string,
  liveSha: string,
): AuditEvent | undefined {
  return operatorVerifiedForSha(events, action, liveSha, (metadata) => metadata.result === "PASS");
}

export function deriveStage2GovernanceEvidence(input: {
  liveSha: string;
  candidateId: string;
  exactShaVerified: boolean;
  permissionsVerified: boolean;
  emergencyStopActive: boolean;
  events: readonly AuditEvent[];
}): ControlledLaunchEvidence {
  const production = productionEvidence(input.events, input.liveSha);
  const rollback = operatorPassEvidence(input.events, STAGE2_GOVERNANCE_ACTIONS.rollbackRehearsal, input.liveSha);
  const monitoring = operatorVerifiedForSha(
    input.events,
    STAGE2_GOVERNANCE_ACTIONS.monitoringActive,
    input.liveSha,
    (metadata) => metadata.monitoringStatus === "ACTIVE",
  );
  const policy = policyEvidence(input.events, input.liveSha);
  const incidents = operatorVerifiedForSha(
    input.events,
    STAGE2_GOVERNANCE_ACTIONS.criticalIncidentReview,
    input.liveSha,
    (metadata) => zeroMetadataCount(metadata, "unresolvedCriticalIncidents"),
  );
  const duplicates = operatorVerifiedForSha(
    input.events,
    STAGE2_GOVERNANCE_ACTIONS.duplicateSendReview,
    input.liveSha,
    (metadata) => zeroMetadataCount(metadata, "unexplainedDuplicateSends"),
  );
  const scope = operatorVerifiedForSha(
    input.events,
    STAGE2_GOVERNANCE_ACTIONS.scopeApproved,
    input.liveSha,
    (metadata) => metadata.candidateId === input.candidateId && metadata.decision === "APPROVED",
  );
  const smoke = operatorVerifiedForSha(
    input.events,
    STAGE2_GOVERNANCE_ACTIONS.authenticatedSmoke,
    input.liveSha,
    (metadata) =>
      metadata.result === "PASS" &&
      metadata.authenticated === true &&
      metadata.readOnly === true &&
      metadata.externalWritesAttempted === false,
  );
  const runbook = operatorVerifiedForSha(
    input.events,
    STAGE2_GOVERNANCE_ACTIONS.supportRunbookActive,
    input.liveSha,
    (metadata) => metadata.runbookStatus === "ACTIVE",
  );
  const observation = operatorVerifiedForSha(
    input.events,
    STAGE2_GOVERNANCE_ACTIONS.observationWindowComplete,
    input.liveSha,
    (metadata) => {
      const windowStartedAt = metadata.windowStartedAt;
      const windowEndedAt = metadata.windowEndedAt;
      if (metadata.complete !== true || !validTimestamp(windowStartedAt) || !validTimestamp(windowEndedAt)) {
        return false;
      }
      return Date.parse(windowEndedAt) >= Date.parse(windowStartedAt);
    },
  );

  return {
    exactShaVerified: input.exactShaVerified,
    buildVerified: Boolean(production),
    rollbackTested: Boolean(rollback),
    monitoringActive: Boolean(monitoring),
    permissionsVerified: input.permissionsVerified,
    policyVerified: Boolean(policy),
    unresolvedCriticalIncidents: zeroEventCount(incidents, "unresolvedCriticalIncidents") ? 0 : 1,
    unexplainedDuplicateSends: zeroEventCount(duplicates, "unexplainedDuplicateSends") ? 0 : 1,
    emergencyStopActive: input.emergencyStopActive,
    scopeApproved: Boolean(scope),
    smokeTestVerified: Boolean(smoke),
    supportRunbookActive: Boolean(runbook),
    observationWindowComplete: Boolean(observation),
    humanApprovalEnforced: false,
    boundedAutopilotApproved: false,
    approvedFlowsOnlyEnforced: false,
    productionEvidenceRecorded: Boolean(production),
  };
}
