import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AUTOMATION_TRIGGER_TYPES,
  validateAutomationFlow,
} from "../lib/automation/automation-service";
import {
  buildLifecycleEmailDocument,
  LIFECYCLE_EMAIL_DEFINITIONS,
} from "../modules/email-automation/automation/lifecycle-provisioning";

const expected = [
  "NEW_LEAD",
  "FORM_ABANDONED",
  "PAYMENT_PENDING",
  "PAYMENT_ABANDONED",
  "PAYMENT_PAID",
];

assert.equal(LIFECYCLE_EMAIL_DEFINITIONS.length, 5);
assert.deepEqual(LIFECYCLE_EMAIL_DEFINITIONS.map((item) => item.trigger), expected);
assert.equal(new Set(LIFECYCLE_EMAIL_DEFINITIONS.map((item) => item.name)).size, 5);
assert.equal(LIFECYCLE_EMAIL_DEFINITIONS.some((item) => item.trigger === "FORM_SUBMITTED"), false);
assert.equal(LIFECYCLE_EMAIL_DEFINITIONS.filter((item) => item.purpose === "MARKETING").length, 1);
assert.equal(LIFECYCLE_EMAIL_DEFINITIONS.find((item) => item.trigger === "FORM_ABANDONED")?.purpose, "MARKETING");
assert.equal(LIFECYCLE_EMAIL_DEFINITIONS.filter((item) => item.purpose === "TRANSACTIONAL").length, 4);
const marketing = LIFECYCLE_EMAIL_DEFINITIONS.find((item) => item.purpose === "MARKETING");
assert.ok(marketing);
const marketingDocument = buildLifecycleEmailDocument(marketing);
assert.ok(marketingDocument.variables.some((item) => item.key === "unsubscribe_url" && item.required));
assert.ok(marketingDocument.blocks.some((item) => item.type === "BUTTON" && item.url === "{{unsubscribe_url}}"));
for (const trigger of expected) {
  assert.equal(AUTOMATION_TRIGGER_TYPES.includes(trigger as never), true);
  const validation = validateAutomationFlow({
    name: `Test ${trigger}`,
    nodes: [
      { id: "trigger", kind: "TRIGGER", type: trigger as never, label: trigger, config: {} },
      { id: "email", kind: "ACTION", type: "SEND_EMAIL", label: "Send email", config: { templateId: "template-1", templateVersionId: "version-1" } },
      { id: "end", kind: "ACTION", type: "END", label: "End", config: {} },
    ],
  });
  assert.equal(validation.valid, true, `${trigger}: ${validation.errors.join(" ")}`);
}

const source = readFileSync(
  resolve(process.cwd(), "modules/email-automation/automation/lifecycle-provisioning.ts"),
  "utf8",
);
assert.doesNotMatch(source, /setAutomationFlowStatus/);
assert.match(source, /emailPurpose: item.purpose/);
assert.match(source, /activated:\s*false/);
console.log("PASS: email lifecycle provisioning foundation");
