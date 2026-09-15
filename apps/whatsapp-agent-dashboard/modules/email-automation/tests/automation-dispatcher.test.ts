import assert from "node:assert/strict";

import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGER_TYPES,
  validateAutomationFlow,
} from "../../../lib/automation/automation-service";
import { resolveEmailSender } from "../domain/sender-resolution";

assert.ok(AUTOMATION_TRIGGER_TYPES.includes("NEW_LEAD"));
assert.ok(AUTOMATION_TRIGGER_TYPES.includes("CONTACT_CREATED"));
assert.ok(AUTOMATION_TRIGGER_TYPES.includes("FORM_SUBMITTED"));
assert.ok(AUTOMATION_ACTION_TYPES.includes("SEND_EMAIL"));

const valid = validateAutomationFlow({
  name: "Lead welcome email",
  nodes: [
    { id: "trigger", kind: "TRIGGER", type: "NEW_LEAD", label: "New lead", config: {} },
    { id: "email", kind: "ACTION", type: "SEND_EMAIL", label: "Welcome email", config: { templateId: "template-1" } },
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

console.log("Email automation E4 dispatcher contracts: PASS");