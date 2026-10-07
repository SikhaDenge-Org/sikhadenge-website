export type QuietHours = {
  startMinuteOfDay: number;
  endMinuteOfDay: number;
};

export type JourneyDispatchContext = {
  nowLocalMinuteOfDay: number;
  quietHours?: QuietHours;
  suppressed: boolean;
  consentGranted: boolean;
  customerRespondedSinceEnrollment: boolean;
  stageChangedSinceEnrollment: boolean;
  sendsInFrequencyWindow: number;
  maxSendsInFrequencyWindow: number;
  scheduledAt: Date;
  now: Date;
};

function minuteValid(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < 1440;
}

export function insideQuietHours(minute: number, quiet: QuietHours): boolean {
  if (!minuteValid(minute) || !minuteValid(quiet.startMinuteOfDay) || !minuteValid(quiet.endMinuteOfDay)) {
    throw new Error("Quiet-hour minute values must be integers from 0 to 1439.");
  }
  if (quiet.startMinuteOfDay === quiet.endMinuteOfDay) return false;
  if (quiet.startMinuteOfDay < quiet.endMinuteOfDay) {
    return minute >= quiet.startMinuteOfDay && minute < quiet.endMinuteOfDay;
  }
  return minute >= quiet.startMinuteOfDay || minute < quiet.endMinuteOfDay;
}

export type JourneyDispatchDecision =
  | { allowed: true }
  | { allowed: false; cancel: boolean; reason: string };

export function evaluateJourneyDispatch(
  context: JourneyDispatchContext,
): JourneyDispatchDecision {
  if (context.suppressed) return { allowed: false, cancel: true, reason: "Customer is suppressed." };
  if (!context.consentGranted) return { allowed: false, cancel: true, reason: "Required consent is absent." };
  if (context.customerRespondedSinceEnrollment) {
    return { allowed: false, cancel: true, reason: "Customer response cancels obsolete follow-up." };
  }
  if (context.stageChangedSinceEnrollment) {
    return { allowed: false, cancel: true, reason: "Lead-stage change cancels obsolete follow-up." };
  }
  if (context.sendsInFrequencyWindow >= context.maxSendsInFrequencyWindow) {
    return { allowed: false, cancel: false, reason: "Frequency cap reached." };
  }
  if (context.now.getTime() < context.scheduledAt.getTime()) {
    return { allowed: false, cancel: false, reason: "Journey step is not due." };
  }
  if (context.quietHours && insideQuietHours(context.nowLocalMinuteOfDay, context.quietHours)) {
    return { allowed: false, cancel: false, reason: "Customer is inside quiet hours." };
  }
  return { allowed: true };
}

export function journeyEnrollmentKey(journeyId: string, customerId: string): string {
  if (!journeyId.trim() || !customerId.trim()) throw new Error("Journey and customer ids are required.");
  return `${encodeURIComponent(journeyId)}:${encodeURIComponent(customerId)}`;
}
