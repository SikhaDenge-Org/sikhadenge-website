import assert from "node:assert/strict";

import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGER_TYPES,
  validateAutomationFlow,
} from "../../../lib/automation/automation-service";
import { assertAutomationEmailDispatchPolicy } from "../application/automation-send-policy";
import { resolveEmailSender } from "../domain/sender-resolution";

assert.ok(AUTOMATION_TRIGGER_TYPES.includes("NEW_LEAD"));
assert.ok(AUTOMATION_TRIGGER_TYPES.includes("CONTACT_CREATED"));
assert.ok(AUTOMATION_TRIGGER_TYPES.includes("FORM_SUBMITTED"));
assert.ok(AUTOMATION_TRIGGER_TYPES.includes("STAGE_CHANGED"));
assert.ok(AUTOMATION_TRIGGER_TYPES.includes("TAG_ADDED"));
assert.ok(AUTOMATION_TRIGGER_TYPES.includes("PAYMENT_PENDING"));
assert.ok(AUTOMATION_TRIGGER_TYPES.includes("PAYMENT_PAID"));
assert.ok(AUTOMATION_TRIGGER_TYPES.includes("APPOINTMENT_CREATED"));
assert.ok(AUTOMATION_TRIGGER_TYPES.includes("APPOINTMENT_REMINDER"));
assert.ok(AUTOMATION_ACTION_TYPES.includes("SEND_EMAIL"));

const validReminder = validateAutomationFlow({
  name: "Appointment reminder",
  nodes: [
    { id: "trigger", kind: "TRIGGER", type: "APPOINTMENT_REMINDER", label: "Appointment reminder", config: { reminderMinutesBefore: "60" } },
    { id: "email", kind: "ACTION", type: "SEND_EMAIL", label: "Reminder email", config: { templateId: "template-1", templateVersionId: "version-1" } },
    { id: "end", kind: "ACTION", type: "END", label: "End", config: {} },
  ],
});
assert.equal(validReminder.valid, true);

const invalidReminder = validateAutomationFlow({
  name: "Broken appointment reminder",
  nodes: [
    { id: "trigger", kind: "TRIGGER", type: "APPOINTMENT_REMINDER", label: "Appointment reminder", config: { reminderMinutesBefore: "0" } },
    { id: "end", kind: "ACTION", type: "END", label: "End", config: {} },
  ],
});
assert.equal(invalidReminder.valid, false);
assert.ok(invalidReminder.errors.some((item) => item.includes("1 and 43,200 minutes")));

const valid = validateAutomationFlow({
  name: "Lead welcome email",
  nodes: [
    { id: "trigger", kind: "TRIGGER", type: "NEW_LEAD", label: "New lead", config: {} },
    { id: "email", kind: "ACTION", type: "SEND_EMAIL", label: "Welcome email", config: { templateId: "template-1", templateVersionId: "version-1" } },
    { id: "end", kind: "ACTION", type: "END", label: "End", config: {} },
  ],
});
assert.equal(valid.valid, true);
assert.ok(valid.warnings.some((item) => item.includes("Email automation execution")));

const invalid = validateAutomationFlow({
  name: "Broken email flow",
  nodes: [
    { id: "trigger", kind: "TRIGGER", type: "FORM_SUBMITTED", label: "Form submitted", config: {} },
    { id: "email", kind: "ACTION", type: "SEND_EMAIL", label: "Email", config: {} },
  ],
});
assert.equal(invalid.valid, false);
assert.ok(invalid.errors.some((item) => item.includes("approved email template ID")));
assert.ok(invalid.errors.some((item) => item.includes("pinned approved email template version ID")));

const sender = resolveEmailSender({
  availableSenders: [
    {
      id: "sender-1",
      workspaceId: "workspace-1",
      connectionId: "connection-1",
      provider: "GOOGLE_GMAIL",
      fromName: "SikhaDenge",
      fromEmail: "team@example.com",
      replyToEmail: null,
      externalSenderId: null,
      verificationStatus: "VERIFIED",
      isProviderDefault: true,
      isWorkspaceDefault: true,
      isActive: true,
      dailyLimit: null,
    },
  ],
  automationSenderIdentityId: "sender-1",
});
assert.equal(sender.source, "AUTOMATION_OVERRIDE");

const dryRun = assertAutomationEmailDispatchPolicy({
  policy: {
    runtimeEnabled: true,
    externalWritesEnabled: false,
    automationEnabled: true,
    inboundSyncEnabled: false,
    trackingEnabled: false,
    mode: "DRY_RUN",
  },
  recipients: [{ email: "lead@example.com" }],
  internalAllowlist: new Set(),
  cohortAllowlist: new Set(),
});
assert.deepEqual(dryRun, { mode: "DRY_RUN", externalRequestAllowed: false });

Object.assign(process.env, {
  EMAIL_DELIVERABILITY_SPF_ALIGNED: "true",
  EMAIL_DELIVERABILITY_DKIM_ALIGNED: "true",
  EMAIL_DELIVERABILITY_DMARC_ALIGNED: "true",
  EMAIL_DELIVERABILITY_HARD_BOUNCE_RATE_PCT: "0.4",
  EMAIL_DELIVERABILITY_COMPLAINT_RATE_PCT: "0.02",
});

const limited = assertAutomationEmailDispatchPolicy({
  policy: {
    runtimeEnabled: true,
    externalWritesEnabled: true,
    automationEnabled: true,
    inboundSyncEnabled: false,
    trackingEnabled: false,
    mode: "LIMITED_COHORT",
  },
  recipients: [{ email: "pilot@example.com" }],
  internalAllowlist: new Set(),
  cohortAllowlist: new Set(["pilot@example.com"]),
});
assert.deepEqual(limited, { mode: "LIMITED_COHORT", externalRequestAllowed: true });

assert.throws(
  () =>
    assertAutomationEmailDispatchPolicy({
      policy: {
        runtimeEnabled: true,
        externalWritesEnabled: true,
        automationEnabled: true,
        inboundSyncEnabled: false,
        trackingEnabled: false,
        mode: "LIMITED_COHORT",
      },
      recipients: [{ email: "outside@example.com" }],
      internalAllowlist: new Set(),
      cohortAllowlist: new Set(["pilot@example.com"]),
    }),
  /not in the email automation cohort allowlist/,
);

const live = assertAutomationEmailDispatchPolicy({
  policy: {
    runtimeEnabled: true,
    externalWritesEnabled: true,
    automationEnabled: true,
    inboundSyncEnabled: false,
    trackingEnabled: false,
    mode: "LIVE",
  },
  recipients: [{ email: "customer@example.com" }],
  internalAllowlist: new Set(),
  cohortAllowlist: new Set(),
});
assert.deepEqual(live, { mode: "LIVE", externalRequestAllowed: true });

console.log("Email automation E4 dispatcher contracts: PASS");
