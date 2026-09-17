import assert from "node:assert/strict";

import {
  evaluateBoundedAutopilotCapacity,
  isBoundedAutopilotReservationConnectionMatch,
  normalizeBoundedAutopilotRecipientKey,
} from "../modules/release/application/controlled-launch-bounded-autopilot";

function testInvalidCapFailsClosed() {
  const result = evaluateBoundedAutopilotCapacity({ maxRealLeads: 0, reservedRecipients: 0, alreadyReserved: false });
  assert.equal(result.allowed, false);
  if (result.allowed) throw new Error("Expected invalid-cap denial.");
  assert.equal(result.code, "BOUNDED_AUTOPILOT_CAP_INVALID");
}

function testCapExhaustionFailsClosed() {
  const result = evaluateBoundedAutopilotCapacity({ maxRealLeads: 3, reservedRecipients: 3, alreadyReserved: false });
  assert.equal(result.allowed, false);
  if (result.allowed) throw new Error("Expected exhausted-cap denial.");
  assert.equal(result.code, "BOUNDED_AUTOPILOT_CAP_EXHAUSTED");
}

function testExistingRecipientDoesNotConsumeAnotherSlot() {
  const result = evaluateBoundedAutopilotCapacity({ maxRealLeads: 3, reservedRecipients: 3, alreadyReserved: true });
  assert.deepEqual(result, { allowed: true, alreadyReserved: true });
}

function testNewRecipientWithinCapIsAllowed() {
  const result = evaluateBoundedAutopilotCapacity({ maxRealLeads: 3, reservedRecipients: 2, alreadyReserved: false });
  assert.deepEqual(result, { allowed: true, alreadyReserved: false });
}

function testRecipientNormalizationIsDeterministic() {
  assert.equal(normalizeBoundedAutopilotRecipientKey("+91 99999-99999"), "919999999999");
}

function testExistingReservationMustStayBoundToConnection() {
  assert.equal(isBoundedAutopilotReservationConnectionMatch("conn-a", "conn-a"), true);
  assert.equal(isBoundedAutopilotReservationConnectionMatch("conn-a", "conn-b"), false);
}

function main() {
  testInvalidCapFailsClosed();
  testCapExhaustionFailsClosed();
  testExistingRecipientDoesNotConsumeAnotherSlot();
  testNewRecipientWithinCapIsAllowed();
  testRecipientNormalizationIsDeterministic();
  testExistingReservationMustStayBoundToConnection();
  console.log("EngageOS Phase17-G3 bounded autopilot caps: PASS");
}

main();
