import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJourneyEnrollment, evaluateNextJourneyStep, journeyStepIdempotencyKey, recordJourneyStepSent } from "../modules/journeys/application/journey-runtime";
import { insideQuietHours } from "../modules/journeys/domain/journey-policy";

const runtime = readFileSync("modules/journeys/application/journey-persistence-runtime.ts", "utf8");
const route = readFileSync("app/api/journeys/runtime/route.ts", "utf8");
const policy = readFileSync("modules/journeys/domain/journey-policy.ts", "utf8");
assert.match(runtime, /journey_runtime_enrollment/);
assert.match(runtime, /journey_runtime_action/);
assert.match(runtime, /JOURNEY_RUNTIME_ENABLED/);
assert.match(runtime, /JOURNEY_ACTIONS_ENABLED/);
assert.match(runtime, /queueOutboundMessage/);
assert.doesNotMatch(runtime, /dispatchOutboundMessage\(/);
assert.match(policy, /Customer response cancels obsolete follow-up/);
assert.match(policy, /Lead-stage change cancels obsolete follow-up/);
assert.match(policy, /Customer is suppressed/);
assert.match(policy, /Required consent is absent/);
assert.match(policy, /Frequency cap reached/);
assert.match(policy, /Customer is inside quiet hours/);
assert.match(runtime, /processDueJourneys/);
assert.match(runtime, /flowType:\s*"AUTOMATION"/);
assert.match(route, /DashboardRole\.ADMIN/);
assert.match(route, /DashboardRole\.MANAGER/);
assert.match(route, /action === "process_due"/);

const enrolledAt = new Date("2026-09-18T00:00:00.000Z");
const enrollment = createJourneyEnrollment({
  journeyId: "demo-followup", customerId: "customer-1", enrolledAt,
  steps: [
    { id: "s1", offsetMinutes: 0, channel: "WHATSAPP", messageReference: "text:hello" },
    { id: "s2", offsetMinutes: 60, channel: "WHATSAPP", messageReference: "template:approved-template" },
  ],
});
assert.equal(journeyStepIdempotencyKey(enrollment, enrollment.steps[0]!), "journey:demo-followup:customer-1:s1");
const due = evaluateNextJourneyStep({ enrollment, now: enrolledAt, nowLocalMinuteOfDay: 720, quietHours: { startMinuteOfDay: 1320, endMinuteOfDay: 480 }, suppressed: false, consentGranted: true, customerRespondedSinceEnrollment: false, stageChangedSinceEnrollment: false, sendsInFrequencyWindow: 0, maxSendsInFrequencyWindow: 5 });
assert.equal(due.decision.allowed, true);
const afterFirst = recordJourneyStepSent(enrollment, "s1");
assert.equal(afterFirst.status, "ACTIVE");
assert.equal(afterFirst.nextStepIndex, 1);
const replyCancelled = evaluateNextJourneyStep({ enrollment: afterFirst, now: new Date("2026-09-18T01:00:00.000Z"), nowLocalMinuteOfDay: 720, quietHours: { startMinuteOfDay: 1320, endMinuteOfDay: 480 }, suppressed: false, consentGranted: true, customerRespondedSinceEnrollment: true, stageChangedSinceEnrollment: false, sendsInFrequencyWindow: 1, maxSendsInFrequencyWindow: 5 });
assert.equal(replyCancelled.decision.allowed, false);
assert.equal("cancel" in replyCancelled.decision && replyCancelled.decision.cancel, true);
assert.equal(insideQuietHours(1380, { startMinuteOfDay: 1320, endMinuteOfDay: 480 }), true);
console.log("Phase9 journey runtime certification: PASS");
