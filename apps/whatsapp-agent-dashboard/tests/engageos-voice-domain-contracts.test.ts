import assert from "node:assert/strict";

import {
  agentRolesForStage,
  evaluateVoiceEligibility,
  hasVoiceCapability,
  isAllowedVoiceLeadTransition,
} from "../modules/voice/domain/voice-contracts";

function eligible() {
  return {
    consentState: "OPTED_IN" as const,
    suppressed: false,
    workspaceKillSwitchActive: false,
    voiceKillSwitchActive: false,
    runtimeEnabled: true,
    externalWritesAllowed: true,
    providerHealthy: true,
    withinAllowedCallingWindow: true,
    phonePresent: true,
  };
}

assert.deepEqual(evaluateVoiceEligibility(eligible()), {
  allowed: true,
  reasons: [],
});

assert.deepEqual(
  evaluateVoiceEligibility({ ...eligible(), consentState: "UNKNOWN" }),
  { allowed: false, reasons: ["VOICE_CONSENT_REQUIRED"] },
);

assert.deepEqual(
  evaluateVoiceEligibility({
    ...eligible(),
    suppressed: true,
    voiceKillSwitchActive: true,
    externalWritesAllowed: false,
  }),
  {
    allowed: false,
    reasons: [
      "CUSTOMER_SUPPRESSED",
      "VOICE_KILL_SWITCH_ACTIVE",
      "EXTERNAL_WRITES_NOT_APPROVED",
    ],
  },
);

assert.equal(isAllowedVoiceLeadTransition("NEW", "DISCOVERY"), true);
assert.equal(isAllowedVoiceLeadTransition("NEW", "ENROLLED"), false);
assert.equal(isAllowedVoiceLeadTransition("QUALIFIED", "DEMO_BOOKED"), true);
assert.equal(isAllowedVoiceLeadTransition("PAYMENT_PENDING", "ENROLLED"), true);
assert.equal(isAllowedVoiceLeadTransition("CLOSED", "NEW"), false);

assert.deepEqual(agentRolesForStage("NEW"), [
  "COMPLIANCE_TRIAGE",
  "QUALIFICATION",
]);
assert.deepEqual(agentRolesForStage("ENROLLED"), []);

assert.equal(
  hasVoiceCapability(
    { OUTBOUND_CALL: true, WARM_TRANSFER: false },
    "OUTBOUND_CALL",
  ),
  true,
);
assert.equal(
  hasVoiceCapability(
    { OUTBOUND_CALL: true, WARM_TRANSFER: false },
    "WARM_TRANSFER",
  ),
  false,
);

console.log("Voice domain contracts: PASS");
