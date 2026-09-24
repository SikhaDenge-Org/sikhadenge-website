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

const healthy: EmailDeliverabilitySnapshot = {
  spfAligned: true,
  dkimAligned: true,
  dmarcAligned: true,
  hardBounceRatePct: 0.4,
  complaintRatePct: 0.02,
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
  const unknown: EmailDeliverabilitySnapshot = {
    spfAligned: null,
    dkimAligned: null,
    dmarcAligned: null,
    hardBounceRatePct: null,
    complaintRatePct: null,
  };
  for (const mode of ["DRY_RUN", "INTERNAL_RECIPIENTS"] as const) {
    const decision = evaluateEmailDeliverabilityGuardrails({ mode, snapshot: unknown });
    assert.equal(decision.enforced, false);
    assert.equal(decision.allowed, true);
  }
}

function testMissingScaledTelemetryFailsClosed() {
  const decision = evaluateEmailDeliverabilityGuardrails({
    mode: "LIMITED_COHORT",
    snapshot: {
      spfAligned: null,
      dkimAligned: null,
      dmarcAligned: null,
      hardBounceRatePct: null,
      complaintRatePct: null,
    },
  });
  assert.equal(decision.enforced, true);
  assert.equal(decision.allowed, false);
  assert.match(decision.reasons.join(" "), /SPF alignment/i);
  assert.match(decision.reasons.join(" "), /DKIM alignment/i);
  assert.match(decision.reasons.join(" "), /DMARC alignment/i);
  assert.match(decision.reasons.join(" "), /hard-bounce rate telemetry/i);
  assert.match(decision.reasons.join(" "), /complaint\/spam rate telemetry/i);
}

function testBoundaryRatesFailClosed() {
  const bounce = evaluateEmailDeliverabilityGuardrails({
    mode: "LIMITED_COHORT",
    snapshot: { ...healthy, hardBounceRatePct: EMAIL_DELIVERABILITY_HARD_BOUNCE_BLOCK_PCT },
  });
  assert.equal(bounce.allowed, false);
  assert.match(bounce.reasons.join(" "), /hard-bounce rate/i);

  const complaint = evaluateEmailDeliverabilityGuardrails({
    mode: "LIVE",
    snapshot: { ...healthy, complaintRatePct: EMAIL_DELIVERABILITY_COMPLAINT_BLOCK_PCT },
  });
  assert.equal(complaint.allowed, false);
  assert.match(complaint.reasons.join(" "), /complaint\/spam rate/i);
}

function testHealthyScaledSnapshotPasses() {
  for (const mode of ["LIMITED_COHORT", "LIVE"] as const) {
    const decision = evaluateEmailDeliverabilityGuardrails({ mode, snapshot: healthy });
    assert.equal(decision.enforced, true);
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.reasons, []);
  }
}

function testEnvironmentContractIsDeclaredFailClosed() {
  const example = readFileSync(".env.example", "utf8");
  for (const name of [
    "EMAIL_DELIVERABILITY_SPF_ALIGNED",
    "EMAIL_DELIVERABILITY_DKIM_ALIGNED",
    "EMAIL_DELIVERABILITY_DMARC_ALIGNED",
    "EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT",
    "EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT",
  ]) {
    assert.match(example, new RegExp(`^${name}=\\"\\"$`, "m"), `${name} must be declared empty/fail-closed in .env.example`);
  }
}

function withDeliverabilityEnv(values: Record<string, string | undefined>, fn: () => void) {
  const keys = Object.keys(values);
  const before = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of before) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function testAutomationScaledDispatchIsActuallyGated() {
  const recipient = { email: "learner@example.com" };
  const cohort = new Set([recipient.email]);
  const internal = new Set([recipient.email]);

  withDeliverabilityEnv(
    {
      EMAIL_DELIVERABILITY_SPF_ALIGNED: undefined,
      EMAIL_DELIVERABILITY_DKIM_ALIGNED: undefined,
      EMAIL_DELIVERABILITY_DMARC_ALIGNED: undefined,
      EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT: undefined,
      EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT: undefined,
    },
    () => {
      assert.throws(
        () => assertAutomationEmailDispatchPolicy({
          policy: policy("LIMITED_COHORT"),
          recipients: [recipient],
          internalAllowlist: internal,
          cohortAllowlist: cohort,
        }),
        /deliverability guard blocked scaled external delivery/i,
      );
    },
  );

  withDeliverabilityEnv(
    {
      EMAIL_DELIVERABILITY_SPF_ALIGNED: "true",
      EMAIL_DELIVERABILITY_DKIM_ALIGNED: "true",
      EMAIL_DELIVERABILITY_DMARC_ALIGNED: "true",
      EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT: "0.4",
      EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT: "0.02",
    },
    () => {
      const limited = assertAutomationEmailDispatchPolicy({
        policy: policy("LIMITED_COHORT"),
        recipients: [recipient],
        internalAllowlist: internal,
        cohortAllowlist: cohort,
      });
      assert.deepEqual(limited, { mode: "LIMITED_COHORT", externalRequestAllowed: true });

      const live = assertAutomationEmailDispatchPolicy({
        policy: policy("LIVE"),
        recipients: [{ email: "external@example.net" }],
        internalAllowlist: new Set(),
        cohortAllowlist: new Set(),
      });
      assert.deepEqual(live, { mode: "LIVE", externalRequestAllowed: true });
    },
  );
}

testSafePreScaleModesAreNotBlocked();
testMissingScaledTelemetryFailsClosed();
testBoundaryRatesFailClosed();
testHealthyScaledSnapshotPasses();
testEnvironmentContractIsDeclaredFailClosed();
testAutomationScaledDispatchIsActuallyGated();

console.log("Email Phase D deliverability guardrail contracts: PASS");
