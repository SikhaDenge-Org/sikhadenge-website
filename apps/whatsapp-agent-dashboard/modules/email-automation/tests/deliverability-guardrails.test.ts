import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EMAIL_DELIVERABILITY_COMPLAINT_BLOCK_PCT,
  EMAIL_DELIVERABILITY_HARD_BOUNCE_BLOCK_PCT,
  evaluateEmailDeliverabilityGuardrails,
  type EmailDeliverabilitySnapshot,
} from "../application/deliverability-guardrails";
import { assertAutomationEmailDispatchPolicy } from "../application/automation-send-policy";
import type { EmailRuntimePolicy } from "../application/runtime-policy";
import type { EmailRuntimeMode } from "../domain/contracts";

const now = new Date("2026-09-24T12:00:00.000Z");
const healthy: EmailDeliverabilitySnapshot = {
  checkedAt: "2026-09-24T11:30:00.000Z",
  spfAligned: true,
  dkimAligned: true,
  dmarcAligned: true,
  hardBounceRatePct: 0.4,
  complaintRatePct: 0.02,
  complaintTelemetryQualified: true,
};

function policy(mode: EmailRuntimeMode): EmailRuntimePolicy {
  return {
    runtimeEnabled: true,
    externalWritesEnabled: mode !== "DRY_RUN" && mode !== "DISABLED",
    automationEnabled: true,
    inboundSyncEnabled: false,
    trackingEnabled: false,
    mode,
  };
}

function testSafePreScaleModesAreNotBlocked() {
  for (const mode of ["DRY_RUN", "INTERNAL_RECIPIENTS"] as const) {
    const decision = evaluateEmailDeliverabilityGuardrails({ mode, snapshot: null, now });
    assert.equal(decision.enforced, false);
    assert.equal(decision.allowed, true);
  }
}

function testMissingScaledTelemetryFailsClosed() {
  const decision = evaluateEmailDeliverabilityGuardrails({ mode: "LIMITED_COHORT", snapshot: null, now });
  assert.equal(decision.enforced, true);
  assert.equal(decision.allowed, false);
  assert.match(decision.reasons.join(" "), /persisted deliverability evidence is missing/i);
  assert.match(decision.reasons.join(" "), /SPF provider authorization/i);
  assert.match(decision.reasons.join(" "), /DKIM sender-domain/i);
  assert.match(decision.reasons.join(" "), /DMARC sender-domain/i);
  assert.match(decision.reasons.join(" "), /hard-bounce rate telemetry/i);
  assert.match(decision.reasons.join(" "), /authoritative complaint\/spam telemetry source/i);
}

function testStaleEvidenceFailsClosed() {
  const decision = evaluateEmailDeliverabilityGuardrails({
    mode: "LIMITED_COHORT",
    snapshot: { ...healthy, checkedAt: "2026-09-22T10:00:00.000Z" },
    env: { EMAIL_DELIVERABILITY_EVIDENCE_MAX_AGE_MINUTES: "1440" },
    now,
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reasons.join(" "), /stale or invalid/i);
}

function testUnqualifiedComplaintSourceFailsClosed() {
  const decision = evaluateEmailDeliverabilityGuardrails({
    mode: "LIMITED_COHORT",
    snapshot: { ...healthy, complaintTelemetryQualified: false, complaintRatePct: 0 },
    now,
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reasons.join(" "), /authoritative complaint\/spam telemetry source/i);
}

function testBoundaryRatesFailClosed() {
  const bounce = evaluateEmailDeliverabilityGuardrails({
    mode: "LIMITED_COHORT",
    snapshot: { ...healthy, hardBounceRatePct: EMAIL_DELIVERABILITY_HARD_BOUNCE_BLOCK_PCT },
    now,
  });
  assert.equal(bounce.allowed, false);
  assert.match(bounce.reasons.join(" "), /hard-bounce rate/i);

  const complaint = evaluateEmailDeliverabilityGuardrails({
    mode: "LIVE",
    snapshot: { ...healthy, complaintRatePct: EMAIL_DELIVERABILITY_COMPLAINT_BLOCK_PCT },
    now,
  });
  assert.equal(complaint.allowed, false);
  assert.match(complaint.reasons.join(" "), /complaint\/spam rate/i);
}

function testHealthyScaledSnapshotPasses() {
  for (const mode of ["LIMITED_COHORT", "LIVE"] as const) {
    const decision = evaluateEmailDeliverabilityGuardrails({ mode, snapshot: healthy, now });
    assert.equal(decision.enforced, true);
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.reasons, []);
  }
}

function testEnvironmentContractUsesAutomatedEvidenceControls() {
  const example = readFileSync(".env.example", "utf8");
  for (const name of [
    "EMAIL_DELIVERABILITY_REFRESH_MINUTES",
    "EMAIL_DELIVERABILITY_EVIDENCE_MAX_AGE_MINUTES",
    "EMAIL_DELIVERABILITY_REPUTATION_WINDOW_HOURS",
    "EMAIL_DELIVERABILITY_DKIM_SELECTORS_GOOGLE_GMAIL",
    "EMAIL_DELIVERABILITY_DKIM_SELECTORS_MICROSOFT_365",
  ]) {
    assert.match(example, new RegExp(`^${name}=`, "m"), `${name} must be declared in .env.example`);
  }
  for (const legacy of [
    "EMAIL_DELIVERABILITY_SPF_ALIGNED",
    "EMAIL_DELIVERABILITY_DKIM_ALIGNED",
    "EMAIL_DELIVERABILITY_DMARC_ALIGNED",
    "EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT",
    "EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT",
  ]) {
    assert.doesNotMatch(example, new RegExp(`^${legacy}=`, "m"), `${legacy} must not remain a runtime source of truth`);
  }
}

function testAutomationScaledDispatchRequiresExplicitPersistedSnapshot() {
  const recipient = { email: "learner@example.com" };
  const cohort = new Set([recipient.email]);
  const internal = new Set([recipient.email]);
  const legacyEnv = {
    ...process.env,
    EMAIL_DELIVERABILITY_SPF_ALIGNED: "true",
    EMAIL_DELIVERABILITY_DKIM_ALIGNED: "true",
    EMAIL_DELIVERABILITY_DMARC_ALIGNED: "true",
    EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT: "0",
    EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT: "0",
  };
  const original = process.env;
  process.env = legacyEnv;
  try {
    assert.throws(
      () => assertAutomationEmailDispatchPolicy({
        policy: policy("LIMITED_COHORT"),
        recipients: [recipient],
        internalAllowlist: internal,
        cohortAllowlist: cohort,
      }),
      /deliverability guard blocked scaled external delivery/i,
    );
  } finally {
    process.env = original;
  }

  const limited = assertAutomationEmailDispatchPolicy({
    policy: policy("LIMITED_COHORT"),
    recipients: [recipient],
    internalAllowlist: internal,
    cohortAllowlist: cohort,
    deliverabilitySnapshot: healthy,
  });
  assert.deepEqual(limited, { mode: "LIMITED_COHORT", externalRequestAllowed: true });

  const live = assertAutomationEmailDispatchPolicy({
    policy: policy("LIVE"),
    recipients: [{ email: "external@example.net" }],
    internalAllowlist: new Set(),
    cohortAllowlist: new Set(),
    deliverabilitySnapshot: healthy,
  });
  assert.deepEqual(live, { mode: "LIVE", externalRequestAllowed: true });
}

testSafePreScaleModesAreNotBlocked();
testMissingScaledTelemetryFailsClosed();
testStaleEvidenceFailsClosed();
testUnqualifiedComplaintSourceFailsClosed();
testBoundaryRatesFailClosed();
testHealthyScaledSnapshotPasses();
testEnvironmentContractUsesAutomatedEvidenceControls();
testAutomationScaledDispatchRequiresExplicitPersistedSnapshot();

console.log("Email P1 persisted deliverability guardrail contracts: PASS");
