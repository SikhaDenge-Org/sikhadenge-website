import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const contracts = readFileSync(
  resolve(root, "modules/email-automation/automation/contracts.ts"),
  "utf8",
);
const engagement = readFileSync(
  resolve(root, "lib/engagement/engagement-service.ts"),
  "utf8",
);

for (const trigger of [
  "FORM_STARTED",
  "FORM_ABANDONED",
  "CHECKOUT_STARTED",
  "PAYMENT_ABANDONED",
]) {
  assert.match(contracts, new RegExp(`"${trigger}"`));
}

assert.match(engagement, /FORM_ABANDON_AFTER_MINUTES = 20/);
assert.match(engagement, /PAYMENT_ABANDON_AFTER_MINUTES = 30/);
assert.match(engagement, /trigger:"FORM_ABANDONED"/);
assert.match(engagement, /trigger:"PAYMENT_ABANDONED"/);

const masterclass = readFileSync(
  resolve(root, "lib/automation/masterclass-registration-flow.ts"),
  "utf8",
);
assert.match(masterclass, /trigger: "FORM_SUBMITTED"/);
assert.match(masterclass, /relatedTriggers: existing \? \[\] : \["NEW_LEAD"\]/);
assert.match(masterclass, /sourceEventId: `masterclass-registration:\$\{registrationId\}`/);
