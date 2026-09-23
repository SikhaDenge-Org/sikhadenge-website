import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isChannelType } from "@/modules/channels/core/contracts/channel";

import { missingEmailPhaseDependencies } from "../application/phase-manifest";
import { resolveEmailSender } from "../domain/sender-resolution";
import type { EmailSendRequest, EmailSenderIdentity } from "../domain/contracts";
import {
  decryptEmailCredential,
  encryptEmailCredential,
} from "../infrastructure/credential-crypto";
import { buildGmailMime } from "../messaging/gmail-mime";
import {
  createGmailOAuthState,
  verifyGmailOAuthState,
} from "../providers/gmail/oauth-state";
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
    isProviderDefault: false,
    isWorkspaceDefault: false,
    isActive: true,
    dailyLimit: null,
    ...overrides,
  };
}

function testSenderPrecedence() {
  const available = [
    sender({
      id: "workspace",
      fromEmail: "mail@sikhadenge.in",
      isProviderDefault: true,
      isWorkspaceDefault: true,
    }),
    sender({ id: "template", fromEmail: "masterclass@sikhadenge.in" }),
    sender({ id: "automation", fromEmail: "admission@sikhadenge.in" }),
    sender({ id: "manual", fromEmail: "support@sikhadenge.in" }),
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

function testMultipleWorkspaceDefaultsFailClosed() {
  assert.throws(
    () =>
      resolveEmailSender({
        availableSenders: [
          sender({ id: "one", isWorkspaceDefault: true }),
          sender({ id: "two", isWorkspaceDefault: true }),
        ],
      }),
    /multiple verified workspace default/i,
  );
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
  assert.equal(mapped.isProviderDefault, true);
  assert.equal(mapped.isWorkspaceDefault, false);

  const primary = gmailSendAsToSenderIdentity({
    workspaceId: "workspace-1",
    connectionId: "connection-1",
    resource: { sendAsEmail: "support@sikhadenge.in", isPrimary: true },
  });
  assert.equal(primary.verificationStatus, "VERIFIED");
}

function testEmailIsFirstClassChannel() {
  assert.equal(isChannelType("EMAIL"), true);
}

function testCredentialEncryption() {
  const key = Buffer.alloc(32, 7);
  const encrypted = encryptEmailCredential({
    plaintext: "oauth-secret-token",
    key,
    keyVersion: "email-v1",
  });
  assert.notEqual(encrypted.ciphertext, "oauth-secret-token");
  assert.equal(
    decryptEmailCredential({ encrypted, key, expectedKeyVersion: "email-v1" }),
    "oauth-secret-token",
  );

  assert.throws(
    () =>
      decryptEmailCredential({
        encrypted: {
          ...encrypted,
          authenticationTag: Buffer.alloc(16, 1).toString("base64"),
        },
        key,
      }),
  );
}

function testOAuthStateSecurity() {
  const secret = "email-oauth-state-secret-at-least-32-characters";
  const issuedAt = Date.UTC(2026, 8, 14, 17, 0, 0);
  const state = createGmailOAuthState({
    workspaceId: "workspace-1",
    secret,
    now: issuedAt,
  });
  const verified = verifyGmailOAuthState({
    state,
    secret,
    expectedWorkspaceId: "workspace-1",
    now: issuedAt + 60_000,
  });
  assert.equal(verified.workspaceId, "workspace-1");

  assert.throws(
    () =>
      verifyGmailOAuthState({
        state,
        secret,
        expectedWorkspaceId: "workspace-2",
        now: issuedAt + 60_000,
      }),
    /workspace does not match/i,
  );

  assert.throws(
    () =>
      verifyGmailOAuthState({
        state,
        secret,
        expectedWorkspaceId: "workspace-1",
        now: issuedAt + 11 * 60_000,
      }),
    /expired/i,
  );
}

function testRfc8058OneClickUnsubscribeContract() {
  const request: EmailSendRequest = {
    workspaceId: "workspace-1",
    connectionId: "connection-1",
    senderIdentityId: "sender-1",
    from: { email: "support@sikhadenge.in", name: "SikhaDenge" },
    to: [{ email: "learner@example.com", name: "Learner" }],
    rendered: {
      subject: "Marketing update",
      html: "<p>Update</p>",
      text: "Update",
      variables: {
        unsubscribe_url: "https://email.example.com/api/email/unsubscribe?t=signed-token",
      },
    },
    idempotencyKey: "one-click-test",
  };

  const marketingMime = buildGmailMime(request, request.from);
  assert.match(marketingMime, /List-Unsubscribe: <https:\/\/email\.example\.com\/api\/email\/unsubscribe\?t=signed-token>/);
  assert.match(marketingMime, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);

  const transactionalMime = buildGmailMime({
    ...request,
    rendered: { ...request.rendered, variables: {} },
  }, request.from);
  assert.doesNotMatch(transactionalMime, /List-Unsubscribe:/);
  assert.doesNotMatch(transactionalMime, /List-Unsubscribe-Post:/);

  const routeSource = readFileSync("app/api/email/unsubscribe/route.ts", "utf8");
  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /application\/x-www-form-urlencoded/);
  assert.match(routeSource, /List-Unsubscribe/);
  assert.match(routeSource, /One-Click/);
  assert.match(routeSource, /status: 204/);
}

testSenderPrecedence();
testMultipleWorkspaceDefaultsFailClosed();
testUnverifiedOverrideFailsClosed();
testPhaseDependencies();
testTemplateApprovalLifecycle();
testGmailAliasNormalization();
testEmailIsFirstClassChannel();
testCredentialEncryption();
testOAuthStateSecurity();
testRfc8058OneClickUnsubscribeContract();

console.log("Email automation E0/E1 foundation contracts: PASS");
