import assert from "node:assert/strict";

import { percentile } from "../lib/observability/metrics";
import {
  estimateModelCostUsd,
  getAgentRuntimePolicy,
} from "../lib/observability/runtime-policy";
import {
  compactOperationalError,
  sanitizeOperationalValue,
} from "../lib/observability/sanitize";

const saved = {
  enabled: process.env.AGENT_ENABLED,
  killSwitch: process.env.AGENT_KILL_SWITCH,
  modelCalls: process.env.AGENT_MODEL_CALLS_ENABLED,
  maximumOutputTokens: process.env.OPENAI_MAX_OUTPUT_TOKENS,
};

try {
  process.env.AGENT_ENABLED = "true";
  process.env.AGENT_KILL_SWITCH = "off";
  process.env.AGENT_MODEL_CALLS_ENABLED = "true";
  process.env.OPENAI_MAX_OUTPUT_TOKENS = "900";

  const enabled = getAgentRuntimePolicy();
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.killSwitchActive, false);
  assert.equal(enabled.modelCallsEnabled, true);
  assert.equal(enabled.maximumOutputTokens, 900);

  process.env.AGENT_KILL_SWITCH = "on";
  const killed = getAgentRuntimePolicy();
  assert.equal(killed.enabled, false);
  assert.equal(killed.killSwitchActive, true);
} finally {
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore("AGENT_ENABLED", saved.enabled);
  restore("AGENT_KILL_SWITCH", saved.killSwitch);
  restore("AGENT_MODEL_CALLS_ENABLED", saved.modelCalls);
  restore("OPENAI_MAX_OUTPUT_TOKENS", saved.maximumOutputTokens);
}

assert.equal(
  estimateModelCostUsd({
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    inputCostPerMillionUsd: 1,
    outputCostPerMillionUsd: 2,
  }),
  2,
);
assert.equal(
  estimateModelCostUsd({
    inputTokens: 100,
    outputTokens: 50,
    inputCostPerMillionUsd: 0,
    outputCostPerMillionUsd: 0,
  }),
  null,
);

assert.equal(percentile([10, 20, 30, 40, 50], 0.95), 50);
assert.equal(percentile([10, 20, 30, 40, 50], 0.5), 30);
assert.equal(percentile([], 0.95), null);

const sanitized = sanitizeOperationalValue({
  email: "ankit@example.com",
  phone: "+91 9876543210",
  accessToken: "top-secret-token",
  nested: {
    payment: "4111 1111 1111 1111",
    paymentWithText: "Card 4111-1111-1111-1111 failed",
  },
}) as Record<string, unknown>;
assert.equal(sanitized.email, "[REDACTED_EMAIL]");
assert.equal(sanitized.phone, "[REDACTED_PHONE]");
assert.equal(sanitized.accessToken, "[REDACTED_SECRET]");
assert.deepEqual(sanitized.nested, {
  payment: "[REDACTED_NUMBER]",
  paymentWithText: "Card [REDACTED_NUMBER] failed",
});
assert.ok(!JSON.stringify(sanitized).includes("4111"));

const compacted = compactOperationalError(
  new Error("Failed for ankit@example.com and +91 9876543210"),
);
assert.ok(!compacted.includes("ankit@example.com"));
assert.ok(!compacted.includes("9876543210"));
assert.ok(compacted.includes("[REDACTED_PHONE]"));
assert.ok(!compacted.includes("+[REDACTED_NUMBER]"));

console.log("OBSERVABILITY_SMOKE_PASS=23");
