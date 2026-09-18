import assert from "node:assert/strict";

import {
  EMAIL_AUTOMATION_AUTO_MAX_ATTEMPTS,
  EMAIL_AUTOMATION_MANUAL_MAX_ATTEMPTS,
  classifyEmailProviderFailure,
  computeEmailAutomationRetryDelayMs,
  emailAutomationPendingRetryError,
  isPendingEmailAutomationRetry,
  isPersistedDeliveryRetrySafe,
  persistedEmailDeliveryError,
} from "../providers/provider-error-policy";

assert.equal(EMAIL_AUTOMATION_AUTO_MAX_ATTEMPTS, 5);
assert.equal(EMAIL_AUTOMATION_MANUAL_MAX_ATTEMPTS, 20);

const rate = classifyEmailProviderFailure(new Error("Gmail message send failed with HTTP 429."));
assert.equal(rate.safeToRetry, true);
assert.equal(rate.autoRetryable, true);
assert.equal(rate.category, "RATE_LIMIT");

for (const status of [502, 503, 504]) {
  const failure = classifyEmailProviderFailure(new Error(`Microsoft Graph sendMail failed with HTTP ${status}.`));
  assert.equal(failure.safeToRetry, true);
  assert.equal(failure.autoRetryable, true);
}

for (const status of [400, 401, 403, 422]) {
  const failure = classifyEmailProviderFailure(new Error(`Gmail message send failed with HTTP ${status}.`));
  assert.equal(failure.safeToRetry, true);
  assert.equal(failure.autoRetryable, false);
}

const ambiguous = classifyEmailProviderFailure(new TypeError("fetch failed"));
assert.equal(ambiguous.safeToRetry, false);
assert.equal(ambiguous.autoRetryable, false);
assert.equal(ambiguous.category, "UNKNOWN");

assert.equal(computeEmailAutomationRetryDelayMs(1, () => 0.5), 30_000);
assert.equal(computeEmailAutomationRetryDelayMs(2, () => 0.5), 60_000);
assert.equal(computeEmailAutomationRetryDelayMs(9, () => 0.5), 3_600_000);
assert.equal(computeEmailAutomationRetryDelayMs(1, () => 0), 22_500);
assert.equal(computeEmailAutomationRetryDelayMs(1, () => 1), 37_500);

const stored = persistedEmailDeliveryError(new Error("Google OAuth token refresh failed with HTTP 503."));
assert.equal(isPersistedDeliveryRetrySafe(stored), true);
const pending = emailAutomationPendingRetryError(new Error("Gmail message send failed with HTTP 429."));
assert.equal(isPendingEmailAutomationRetry(pending), true);

console.log("Email provider failure and retry policy contracts: PASS");
