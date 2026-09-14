import assert from "node:assert/strict";

import { missingEmailPhaseDependencies } from "../application/phase-manifest";
import { resolveEmailSender } from "../domain/sender-resolution";
import type { EmailSenderIdentity } from "../domain/contracts";
import { gmailSendAsToSenderIdentity } from "../providers/gmail/sender-mapping";
import { assertEmailTemplateTransition } from "../templates/contracts";

function sender(overrides: Partial<EmailSenderIdentity>): EmailSenderIdentity {
  return {
    id: "sender-default",
    workspaceId: "workspace-1",
    connectionId: "connection-1",
    provider: "GOOGLE_GMAIL",
    fromName: "SikhaDenge",
    fromEmail: "mail@sikhadenge.in",
    replyToEmail: null,
    externalSenderId: "mail@sikhadenge.in",
    verificationStatus: "VERIFIED",
    isDefault: true,
    isActive: true,
    dailyLimit: null,
    ...overrides,
  };
}

function testSenderPrecedence() {
  const available = [
    sender({ id: "workspace", fromEmail: "mail@sikhadenge.in", isDefault: true }),
    sender({ id: "template", fromEmail: "masterclass@sikhadenge.in", isDefault: false }),
    sender({ id: "automation", fromEmail: "admission@sikhadenge.in", isDefault: false }),
    sender({ id: "manual", fromEmail: "support@sikhadenge.in", isDefault: false }),
  ];

  const manual = resolveEmailSender({
    availableSenders: available,
    manualSenderIdentityId: "manual",
    automationSenderIdentityId: "automation",
    templateSenderIdentityId: "template",
  });
  assert.equal(manual.sender.id, "manual");
  assert.equal(manual.source, "MANUAL_OVERRIDE");

  const automation = resolveEmailSender({
    availableSenders: available,
    automationSenderIdentityId: "automation",
    templateSenderIdentityId: "template",
  });
  assert.equal(automation.sender.id, "automation");
  assert.equal(automation.source, "AUTOMATION_OVERRIDE");

  const template = resolveEmailSender({
    availableSenders: available,
    templateSenderIdentityId: "template",
  });
  assert.equal(template.sender.id, "template");
  assert.equal(template.source, "TEMPLATE_DEFAULT");

  const fallback = resolveEmailSender({ availableSenders: available });
  assert.equal(fallback.sender.id, "workspace");
  assert.equal(fallback.source, "WORKSPACE_DEFAULT");
}

function testUnverifiedOverrideFailsClosed() {
  assert.throws(
    () =>
      resolveEmailSender({
        availableSenders: [sender({ id: "pending", verificationStatus: "PENDING" })],
        manualSenderIdentityId: "pending",
      }),
    /not verified and active/i,
  );
}

function testPhaseDependencies() {
  assert.deepEqual(missingEmailPhaseDependencies("E0", new Set()), []);
  assert.deepEqual(missingEmailPhaseDependencies("E1", new Set(["E0"])), []);
  assert.ok(
    missingEmailPhaseDependencies("E4", new Set(["E0", "E1", "E2"])).includes("E3"),
  );
}

function testTemplateApprovalLifecycle() {
  assert.doesNotThrow(() => assertEmailTemplateTransition("DRAFT", "IN_REVIEW"));
  assert.doesNotThrow(() => assertEmailTemplateTransition("IN_REVIEW", "APPROVED"));
  assert.throws(() => assertEmailTemplateTransition("DRAFT", "APPROVED"), /not allowed/i);
  assert.throws(() => assertEmailTemplateTransition("APPROVED", "DRAFT"), /not allowed/i);
}

function testGmailAliasNormalization() {
  const mapped = gmailSendAsToSenderIdentity({
    workspaceId: "workspace-1",
    connectionId: "connection-1",
    resource: {
      sendAsEmail: "MasterClass@SikhaDenge.in ",
      displayName: "SikhaDenge Masterclass",
      replyToAddress: "Support@SikhaDenge.in",
      verificationStatus: "accepted",
      isDefault: true,
    },
  });

  assert.equal(mapped.fromEmail, "masterclass@sikhadenge.in");
  assert.equal(mapped.replyToEmail, "support@sikhadenge.in");
  assert.equal(mapped.verificationStatus, "VERIFIED");
  assert.equal(mapped.isDefault, true);
}

testSenderPrecedence();
testUnverifiedOverrideFailsClosed();
testPhaseDependencies();
testTemplateApprovalLifecycle();
testGmailAliasNormalization();

console.log("Email automation E0/E1 foundation contracts: PASS");
