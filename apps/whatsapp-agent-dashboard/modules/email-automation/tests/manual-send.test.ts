import assert from "node:assert/strict";
import { assertManualEmailDispatchPolicy } from "../application/manual-send-policy";
import { buildGmailMime, gmailRawBase64Url } from "../messaging/gmail-mime";
import type { EmailRuntimePolicy } from "../application/runtime-policy";
import type { EmailSendRequest } from "../domain/contracts";

const base: EmailRuntimePolicy = { runtimeEnabled: true, externalWritesEnabled: false, automationEnabled: false, inboundSyncEnabled: false, trackingEnabled: false, mode: "DRY_RUN" };
const dry = assertManualEmailDispatchPolicy({ policy: base, recipients: [{ email: "test@sikhadenge.in" }], allowlist: new Set() });
assert.equal(dry.externalRequestAllowed, false);
assert.throws(() => assertManualEmailDispatchPolicy({ policy: { ...base, mode: "INTERNAL_RECIPIENTS", externalWritesEnabled: true }, recipients: [{ email: "outside@example.com" }], allowlist: new Set(["test@sikhadenge.in"]) }), /allowlist/i);
const internal = assertManualEmailDispatchPolicy({ policy: { ...base, mode: "INTERNAL_RECIPIENTS", externalWritesEnabled: true }, recipients: [{ email: "test@sikhadenge.in" }], allowlist: new Set(["test@sikhadenge.in"]) });
assert.equal(internal.externalRequestAllowed, true);
assert.throws(() => assertManualEmailDispatchPolicy({ policy: { ...base, mode: "LIVE", externalWritesEnabled: true }, recipients: [{ email: "test@sikhadenge.in" }], allowlist: new Set(["test@sikhadenge.in"]) }), /not enabled/i);

const request: EmailSendRequest = {
  workspaceId: "workspace-1", connectionId: "connection-1", senderIdentityId: "sender-1", from: { email: "mail@sikhadenge.in", name: "SikhaDenge" },
  to: [{ email: "test@sikhadenge.in", name: "Test User" }], cc: [], bcc: [], replyTo: { email: "support@sikhadenge.in" },
  rendered: { subject: "Welcome \u2713", html: "<p>Hello</p>", text: "Hello", variables: {} },
  attachments: [{ assetId: "asset-1", fileName: "guide.pdf", mimeType: "application/pdf", sizeBytes: 4, disposition: "ATTACHMENT", contentBase64: Buffer.from("test").toString("base64") }],
  idempotencyKey: "manual:test:001",
};
const mime = buildGmailMime(request, request.from);
assert.match(mime, /From: SikhaDenge <mail@sikhadenge.in>/);
assert.match(mime, /Content-Disposition: attachment/);
assert.match(mime, /Subject: =\?UTF-8\?B\?/);
assert.ok(gmailRawBase64Url(mime).length > mime.length / 2);
assert.throws(() => buildGmailMime({ ...request, to: [{ email: "a@example.com\r\nBcc: bad@example.com" }] }, request.from), /newline|invalid/i);
console.log("Email automation E3 manual send contracts: PASS");
