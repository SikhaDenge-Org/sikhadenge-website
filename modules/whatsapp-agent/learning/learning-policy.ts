import type { LearningCandidate } from "../domain/types";

export const LEARNING_POLICY = {
  autoPublishRawChats: false,
  requireHumanApproval: true,
  storeSensitiveDataInKnowledge: false,
  minimumEvidenceExamples: 2,
  allowedCandidateCategories: [
    "COUNSELOR_CORRECTION",
    "SUCCESSFUL_REPLY",
    "MISSING_KNOWLEDGE",
    "FAILED_REPLY",
  ] as const,
};

const SENSITIVE_PATTERNS: RegExp[] = [
  /\b\d{12}\b/g, // possible Aadhaar-like number
  /\b[A-Z]{5}\d{4}[A-Z]\b/gi, // PAN-like value
  /\b(?:\d[ -]*?){13,19}\b/g, // possible payment card number
  /\b(?:otp|pin|cvv)\b\s*[:=-]?\s*\d+/gi,
];

export function redactSensitiveText(value: string): string {
  return SENSITIVE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "[REDACTED]"),
    value,
  );
}

export function prepareLearningCandidate(
  candidate: Omit<LearningCandidate, "status" | "createdAt">,
): LearningCandidate {
  return {
    ...candidate,
    proposedQuestion: redactSensitiveText(candidate.proposedQuestion.trim()),
    proposedAnswer: redactSensitiveText(candidate.proposedAnswer.trim()),
    evidence: redactSensitiveText(candidate.evidence.trim()),
    status: "PENDING",
    createdAt: new Date(),
  };
}

export function canPublishCandidate(candidate: LearningCandidate): boolean {
  return (
    LEARNING_POLICY.requireHumanApproval &&
    candidate.status === "APPROVED" &&
    Boolean(candidate.reviewedAt) &&
    Boolean(candidate.reviewedBy) &&
    candidate.proposedQuestion.length > 0 &&
    candidate.proposedAnswer.length > 0
  );
}

export function rejectUnsafeCandidate(
  candidate: LearningCandidate,
  reviewedBy: string,
): LearningCandidate {
  return {
    ...candidate,
    status: "REJECTED",
    reviewedAt: new Date(),
    reviewedBy,
  };
}
