export type KnowledgeReference = {
  id: string;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "ARCHIVED";
  effectiveFrom?: Date;
  effectiveTo?: Date;
};

export type GroundingValidation = {
  valid: boolean;
  usableReferenceIds: readonly string[];
  rejectedReferenceIds: readonly string[];
};

export function validateKnowledgeGrounding(input: {
  references: readonly KnowledgeReference[];
  now?: Date;
}): GroundingValidation {
  const now = input.now ?? new Date();
  const usable: string[] = [];
  const rejected: string[] = [];

  for (const reference of input.references) {
    const activeFrom = !reference.effectiveFrom || reference.effectiveFrom.getTime() <= now.getTime();
    const activeTo = !reference.effectiveTo || reference.effectiveTo.getTime() > now.getTime();
    if (reference.id.trim() && reference.status === "APPROVED" && activeFrom && activeTo) {
      usable.push(reference.id);
    } else {
      rejected.push(reference.id);
    }
  }

  return {
    valid: rejected.length === 0 && usable.length > 0,
    usableReferenceIds: usable,
    rejectedReferenceIds: rejected,
  };
}

export function assertGroundedHighRiskAnswer(input: {
  highRisk: boolean;
  grounding: GroundingValidation;
}): void {
  if (input.highRisk && !input.grounding.valid) {
    throw new Error("High-risk answer requires active approved knowledge references.");
  }
}
