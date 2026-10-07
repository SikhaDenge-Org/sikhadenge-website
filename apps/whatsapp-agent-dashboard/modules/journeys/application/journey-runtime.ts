import {
  evaluateJourneyDispatch,
  journeyEnrollmentKey,
  type JourneyDispatchDecision,
  type QuietHours,
} from "@/modules/journeys/domain/journey-policy";

export type JourneyStep = {
  id: string;
  offsetMinutes: number;
  channel: string;
  messageReference: string;
};

export type JourneyEnrollmentStatus = "ACTIVE" | "CANCELLED" | "COMPLETED";

export type JourneyEnrollment = {
  id: string;
  journeyId: string;
  customerId: string;
  enrolledAt: Date;
  status: JourneyEnrollmentStatus;
  steps: readonly JourneyStep[];
  nextStepIndex: number;
  sentStepIds: readonly string[];
  cancelledReason?: string;
};

function validateSteps(steps: readonly JourneyStep[]): JourneyStep[] {
  if (steps.length === 0) throw new Error("Journey requires at least one step.");
  const ids = new Set<string>();
  return [...steps]
    .map((step) => {
      const id = step.id.trim();
      const channel = step.channel.trim();
      const messageReference = step.messageReference.trim();
      if (!id || !channel || !messageReference) throw new Error("Journey step fields are required.");
      if (!Number.isInteger(step.offsetMinutes) || step.offsetMinutes < 0) {
        throw new Error("Journey step offset must be a non-negative integer.");
      }
      if (ids.has(id)) throw new Error("Journey step ids must be unique.");
      ids.add(id);
      return { ...step, id, channel, messageReference };
    })
    .sort((left, right) => left.offsetMinutes - right.offsetMinutes);
}

export function createJourneyEnrollment(input: {
  journeyId: string;
  customerId: string;
  steps: readonly JourneyStep[];
  enrolledAt?: Date;
}): JourneyEnrollment {
  const id = journeyEnrollmentKey(input.journeyId, input.customerId);
  return {
    id,
    journeyId: input.journeyId,
    customerId: input.customerId,
    enrolledAt: input.enrolledAt ?? new Date(),
    status: "ACTIVE",
    steps: validateSteps(input.steps),
    nextStepIndex: 0,
    sentStepIds: [],
  };
}

export function journeyStepIdempotencyKey(enrollment: JourneyEnrollment, step: JourneyStep): string {
  return `journey:${enrollment.id}:${step.id}`;
}

export function evaluateNextJourneyStep(input: {
  enrollment: JourneyEnrollment;
  now: Date;
  nowLocalMinuteOfDay: number;
  quietHours?: QuietHours;
  suppressed: boolean;
  consentGranted: boolean;
  customerRespondedSinceEnrollment: boolean;
  stageChangedSinceEnrollment: boolean;
  sendsInFrequencyWindow: number;
  maxSendsInFrequencyWindow: number;
}): { step: JourneyStep | null; decision: JourneyDispatchDecision } {
  if (input.enrollment.status !== "ACTIVE") {
    return {
      step: null,
      decision: { allowed: false, cancel: true, reason: `Journey enrollment is ${input.enrollment.status}.` },
    };
  }
  const step = input.enrollment.steps[input.enrollment.nextStepIndex] ?? null;
  if (!step) {
    return {
      step: null,
      decision: { allowed: false, cancel: true, reason: "Journey has no remaining step." },
    };
  }
  const scheduledAt = new Date(
    input.enrollment.enrolledAt.getTime() + step.offsetMinutes * 60_000,
  );
  return {
    step,
    decision: evaluateJourneyDispatch({
      nowLocalMinuteOfDay: input.nowLocalMinuteOfDay,
      quietHours: input.quietHours,
      suppressed: input.suppressed,
      consentGranted: input.consentGranted,
      customerRespondedSinceEnrollment: input.customerRespondedSinceEnrollment,
      stageChangedSinceEnrollment: input.stageChangedSinceEnrollment,
      sendsInFrequencyWindow: input.sendsInFrequencyWindow,
      maxSendsInFrequencyWindow: input.maxSendsInFrequencyWindow,
      scheduledAt,
      now: input.now,
    }),
  };
}

export function recordJourneyStepSent(
  enrollment: JourneyEnrollment,
  stepId: string,
): JourneyEnrollment {
  if (enrollment.status !== "ACTIVE") throw new Error("Only active journeys can record sends.");
  const step = enrollment.steps[enrollment.nextStepIndex];
  if (!step || step.id !== stepId) throw new Error("Journey step is not the next due step.");
  const sentStepIds = [...new Set([...enrollment.sentStepIds, stepId])];
  const nextStepIndex = enrollment.nextStepIndex + 1;
  return {
    ...enrollment,
    sentStepIds,
    nextStepIndex,
    status: nextStepIndex >= enrollment.steps.length ? "COMPLETED" : "ACTIVE",
  };
}

export function cancelJourneyEnrollment(
  enrollment: JourneyEnrollment,
  reason: string,
): JourneyEnrollment {
  const cleaned = reason.trim();
  if (!cleaned) throw new Error("Cancellation reason is required.");
  if (enrollment.status === "COMPLETED") throw new Error("Completed journey cannot be cancelled.");
  return { ...enrollment, status: "CANCELLED", cancelledReason: cleaned };
}
