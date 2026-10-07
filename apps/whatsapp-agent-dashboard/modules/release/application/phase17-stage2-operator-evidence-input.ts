import {
  STAGE2_GOVERNANCE_ACTIONS,
} from "@/modules/release/application/phase17-stage2-governance-evidence";

export const STAGE2_OPERATOR_EVIDENCE_COMMIT_PHRASE = "RECORD_OPERATOR_VERIFIED_EVIDENCE";
export const STAGE2_OPERATOR_ATTESTATION_PHRASE = "I_ATTEST_THIS_EVIDENCE_IS_REAL_AND_EXACT_SHA_BOUND";

export const STAGE2_OPERATOR_ACTIONS = [
  STAGE2_GOVERNANCE_ACTIONS.criticalIncidentReview,
  STAGE2_GOVERNANCE_ACTIONS.duplicateSendReview,
  STAGE2_GOVERNANCE_ACTIONS.rollbackRehearsal,
  STAGE2_GOVERNANCE_ACTIONS.monitoringActive,
  STAGE2_GOVERNANCE_ACTIONS.scopeApproved,
  STAGE2_GOVERNANCE_ACTIONS.authenticatedSmoke,
  STAGE2_GOVERNANCE_ACTIONS.supportRunbookActive,
  STAGE2_GOVERNANCE_ACTIONS.observationWindowComplete,
] as const;

export type Stage2OperatorAction = (typeof STAGE2_OPERATOR_ACTIONS)[number];

type Metadata = Record<string, unknown>;

export type Stage2OperatorEvidenceInput = {
  action: string;
  liveSha: string;
  actorId: string;
  proofRef: string;
  verifiedAt: string;
  requestId: string;
  metadataJson: string;
  expectedCandidateId?: string | null;
  now?: Date;
};

export type ValidatedStage2OperatorEvidence = {
  action: Stage2OperatorAction;
  liveSha: string;
  actorId: string;
  proofRef: string;
  verifiedAt: string;
  requestId: string;
  gateMetadata: Metadata;
  metadata: Metadata;
};

const RESERVED_METADATA_KEYS = new Set(["liveSha", "proofRef", "verifiedAt"]);
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function requiredText(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} is required.`);
  return trimmed;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function parseMetadataJson(value: string): Metadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || "{}");
  } catch {
    throw new Error("PHASE17_OPERATOR_METADATA_JSON must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PHASE17_OPERATOR_METADATA_JSON must be a JSON object.");
  }
  const metadata = parsed as Metadata;
  for (const key of RESERVED_METADATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      throw new Error(`PHASE17_OPERATOR_METADATA_JSON must not override reserved key ${key}.`);
    }
  }
  return metadata;
}

function isOperatorAction(value: string): value is Stage2OperatorAction {
  return (STAGE2_OPERATOR_ACTIONS as readonly string[]).includes(value);
}

function requireMetadataText(metadata: Metadata, key: string, expected?: string): string {
  const value = metadata[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Operator evidence metadata.${key} must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (expected !== undefined && normalized !== expected) {
    throw new Error(`Operator evidence metadata.${key} must equal ${expected}.`);
  }
  return normalized;
}

function requireMetadataBoolean(metadata: Metadata, key: string, expected: boolean): void {
  if (metadata[key] !== expected) {
    throw new Error(`Operator evidence metadata.${key} must equal ${String(expected)}.`);
  }
}

function requireMetadataZero(metadata: Metadata, key: string): void {
  if (metadata[key] !== 0) {
    throw new Error(`Operator evidence metadata.${key} must equal numeric 0.`);
  }
}

function validateGateMetadata(
  action: Stage2OperatorAction,
  metadata: Metadata,
  expectedCandidateId?: string | null,
  verifiedAt?: string,
): void {
  switch (action) {
    case STAGE2_GOVERNANCE_ACTIONS.criticalIncidentReview:
      requireMetadataZero(metadata, "unresolvedCriticalIncidents");
      return;
    case STAGE2_GOVERNANCE_ACTIONS.duplicateSendReview:
      requireMetadataZero(metadata, "unexplainedDuplicateSends");
      return;
    case STAGE2_GOVERNANCE_ACTIONS.rollbackRehearsal:
      requireMetadataText(metadata, "result", "PASS");
      return;
    case STAGE2_GOVERNANCE_ACTIONS.monitoringActive:
      requireMetadataText(metadata, "monitoringStatus", "ACTIVE");
      return;
    case STAGE2_GOVERNANCE_ACTIONS.scopeApproved: {
      const candidateId = requiredText(expectedCandidateId ?? "", "PHASE17_STAGE2_CANDIDATE_ID");
      requireMetadataText(metadata, "candidateId", candidateId);
      requireMetadataText(metadata, "decision", "APPROVED");
      return;
    }
    case STAGE2_GOVERNANCE_ACTIONS.authenticatedSmoke:
      requireMetadataText(metadata, "result", "PASS");
      requireMetadataBoolean(metadata, "authenticated", true);
      requireMetadataBoolean(metadata, "readOnly", true);
      requireMetadataBoolean(metadata, "externalWritesAttempted", false);
      return;
    case STAGE2_GOVERNANCE_ACTIONS.supportRunbookActive:
      requireMetadataText(metadata, "runbookStatus", "ACTIVE");
      return;
    case STAGE2_GOVERNANCE_ACTIONS.observationWindowComplete: {
      requireMetadataBoolean(metadata, "complete", true);
      const started = metadata.windowStartedAt;
      const ended = metadata.windowEndedAt;
      if (!validTimestamp(started) || !validTimestamp(ended)) {
        throw new Error("Observation evidence requires valid windowStartedAt and windowEndedAt timestamps.");
      }
      if (Date.parse(ended) < Date.parse(started)) {
        throw new Error("Observation windowEndedAt must be at or after windowStartedAt.");
      }
      if (verifiedAt && Date.parse(ended) > Date.parse(verifiedAt)) {
        throw new Error("Observation windowEndedAt must not be after verifiedAt.");
      }
      return;
    }
  }
}

export function validateStage2OperatorEvidenceInput(
  input: Stage2OperatorEvidenceInput,
): ValidatedStage2OperatorEvidence {
  const action = requiredText(input.action, "PHASE17_OPERATOR_EVIDENCE_ACTION");
  if (!isOperatorAction(action)) {
    throw new Error(`Unsupported operator evidence action: ${action}.`);
  }

  const liveSha = requiredText(input.liveSha, "PHASE17_EXPECTED_LIVE_SHA");
  if (!SHA_PATTERN.test(liveSha)) {
    throw new Error("PHASE17_EXPECTED_LIVE_SHA must be a lowercase 40-character Git SHA.");
  }

  const actorId = requiredText(input.actorId, "PHASE17_OPERATOR_ACTOR_ID");
  const proofRef = requiredText(input.proofRef, "PHASE17_OPERATOR_PROOF_REF");
  const requestId = requiredText(input.requestId, "PHASE17_OPERATOR_REQUEST_ID");
  const verifiedAt = requiredText(input.verifiedAt, "PHASE17_OPERATOR_VERIFIED_AT");
  if (!validTimestamp(verifiedAt)) {
    throw new Error("PHASE17_OPERATOR_VERIFIED_AT must be a valid ISO-compatible timestamp.");
  }

  const now = input.now ?? new Date();
  if (Date.parse(verifiedAt) > now.getTime() + 5 * 60 * 1000) {
    throw new Error("PHASE17_OPERATOR_VERIFIED_AT must not be more than five minutes in the future.");
  }

  const gateMetadata = parseMetadataJson(input.metadataJson);
  validateGateMetadata(action, gateMetadata, input.expectedCandidateId, verifiedAt);

  return {
    action,
    liveSha,
    actorId,
    proofRef,
    verifiedAt,
    requestId,
    gateMetadata,
    metadata: {
      ...gateMetadata,
      liveSha,
      proofRef,
      verifiedAt,
    },
  };
}
