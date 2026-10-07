import { LeadStage, LeadTemperature } from "@prisma/client";

import type { AgentLeadUpdates } from "./types";

export type LeadSnapshot = {
  stage: LeadStage;
  temperature: LeadTemperature;
  score: number;
  occupation: string | null;
  experienceLevel: string | null;
  goal: string | null;
  interestedCourse: string | null;
  joiningTimeline: string | null;
  classAvailability: string | null;
  feeUnderstood: boolean;
  counselorRequested: boolean;
};

export type LeadIntelligenceResult = LeadSnapshot & {
  qualifiedAt: Date | null;
};

const LOCKED_STAGES = new Set<LeadStage>([
  LeadStage.DEMO_BOOKED,
  LeadStage.PAYMENT_PENDING,
  LeadStage.ENROLLED,
  LeadStage.CLOSED,
]);

const WARM_SCORE_THRESHOLD = 35;
const HOT_SCORE_THRESHOLD = 70;

function clean(value: string | undefined, current: string | null): string | null {
  if (typeof value !== "string") return current;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 300) : current;
}

function computeScore(lead: Omit<LeadSnapshot, "score" | "temperature" | "stage">): number {
  let score = 0;
  if (lead.occupation) score += 8;
  if (lead.experienceLevel) score += 8;
  if (lead.goal) score += 16;
  if (lead.interestedCourse) score += 22;
  if (lead.joiningTimeline) score += 18;
  if (lead.classAvailability) score += 10;
  if (lead.feeUnderstood) score += 8;
  if (lead.counselorRequested) score += 10;
  return Math.min(100, score);
}

function temperatureFor(score: number, counselorRequested: boolean): LeadTemperature {
  if (counselorRequested || score >= HOT_SCORE_THRESHOLD) {
    return LeadTemperature.HOT;
  }
  if (score >= WARM_SCORE_THRESHOLD) return LeadTemperature.WARM;
  return LeadTemperature.COLD;
}

function stageFor(input: {
  currentStage: LeadStage;
  score: number;
  counselorRequested: boolean;
  interestedCourse: string | null;
  goal: string | null;
  joiningTimeline: string | null;
}): LeadStage {
  if (LOCKED_STAGES.has(input.currentStage)) return input.currentStage;
  if (input.counselorRequested) return LeadStage.COUNSELOR_ASSIGNED;
  if (
    input.score >= 55 &&
    input.interestedCourse &&
    input.goal &&
    input.joiningTimeline
  ) {
    return LeadStage.QUALIFIED;
  }
  if (input.score > 0) return LeadStage.DISCOVERY;
  return LeadStage.NEW;
}

export function applyLeadIntelligence(
  current: LeadSnapshot,
  updates: AgentLeadUpdates,
): LeadIntelligenceResult {
  const merged = {
    occupation: clean(updates.occupation, current.occupation),
    experienceLevel: clean(updates.experienceLevel, current.experienceLevel),
    goal: clean(updates.goal, current.goal),
    interestedCourse: clean(updates.interestedCourse, current.interestedCourse),
    joiningTimeline: clean(updates.joiningTimeline, current.joiningTimeline),
    classAvailability: clean(updates.classAvailability, current.classAvailability),
    feeUnderstood:
      typeof updates.feeUnderstood === "boolean"
        ? updates.feeUnderstood
        : current.feeUnderstood,
    counselorRequested:
      typeof updates.counselorRequested === "boolean"
        ? updates.counselorRequested
        : current.counselorRequested,
  };

  const score = computeScore(merged);
  const stage = stageFor({
    currentStage: current.stage,
    score,
    counselorRequested: merged.counselorRequested,
    interestedCourse: merged.interestedCourse,
    goal: merged.goal,
    joiningTimeline: merged.joiningTimeline,
  });

  return {
    ...merged,
    score,
    stage,
    temperature: temperatureFor(score, merged.counselorRequested),
    qualifiedAt:
      stage === LeadStage.QUALIFIED
        ? current.stage === LeadStage.QUALIFIED
          ? null
          : new Date()
        : null,
  };
}
