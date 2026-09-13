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

type AuditEvent = {
  action: string;
  outcome: string;
  metadata: unknown;
};

type Metadata = Record<string, unknown>;

function metadataOf(event: AuditEvent | undefined): Metadata {
  return event?.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
    ? (event.metadata as Metadata)
    : {};
}

function verifiedForSha(events: readonly AuditEvent[], action: string, liveSha: string): AuditEvent | undefined {
  return events.find((event) => {
    const metadata = metadataOf(event);
    return event.action === action && event.outcome === "VERIFIED" && metadata.liveSha === liveSha;
  });
}

function verifiedForScope(
  events: readonly AuditEvent[],
  action: string,
  liveSha: string,
  candidateId: string,
): AuditEvent | undefined {
  const event = verifiedForSha(events, action, liveSha);
  return metadataOf(event).candidateId === candidateId ? event : undefined;
}

function zeroCount(event: AuditEvent | undefined, key: string): boolean {
  const value = metadataOf(event)[key];
  return value === 0 || value === "0";
}

export function deriveStage2GovernanceEvidence(input: {
  liveSha: string;
  candidateId: string;
  exactShaVerified: boolean;
  permissionsVerified: boolean;
  emergencyStopActive: boolean;
  events: readonly AuditEvent[];
}): ControlledLaunchEvidence {
  const production = verifiedForSha(input.events, STAGE2_GOVERNANCE_ACTIONS.productionEvidence, input.liveSha);
  const rollback = verifiedForSha(input.events, STAGE2_GOVERNANCE_ACTIONS.rollbackRehearsal, input.liveSha);
  const monitoring = verifiedForSha(input.events, STAGE2_GOVERNANCE_ACTIONS.monitoringActive, input.liveSha);
  const policy = verifiedForSha(input.events, STAGE2_GOVERNANCE_ACTIONS.policyVerified, input.liveSha);
  const incidents = verifiedForSha(input.events, STAGE2_GOVERNANCE_ACTIONS.criticalIncidentReview, input.liveSha);
  const duplicates = verifiedForSha(input.events, STAGE2_GOVERNANCE_ACTIONS.duplicateSendReview, input.liveSha);
  const scope = verifiedForScope(input.events, STAGE2_GOVERNANCE_ACTIONS.scopeApproved, input.liveSha, input.candidateId);
  const smoke = verifiedForSha(input.events, STAGE2_GOVERNANCE_ACTIONS.authenticatedSmoke, input.liveSha);
  const runbook = verifiedForSha(input.events, STAGE2_GOVERNANCE_ACTIONS.supportRunbookActive, input.liveSha);
  const observation = verifiedForSha(input.events, STAGE2_GOVERNANCE_ACTIONS.observationWindowComplete, input.liveSha);

  return {
    exactShaVerified: input.exactShaVerified,
    buildVerified: Boolean(production),
    rollbackTested: Boolean(rollback),
    monitoringActive: Boolean(monitoring),
    permissionsVerified: input.permissionsVerified,
    policyVerified: Boolean(policy),
    unresolvedCriticalIncidents: zeroCount(incidents, "unresolvedCriticalIncidents") ? 0 : 1,
    unexplainedDuplicateSends: zeroCount(duplicates, "unexplainedDuplicateSends") ? 0 : 1,
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
