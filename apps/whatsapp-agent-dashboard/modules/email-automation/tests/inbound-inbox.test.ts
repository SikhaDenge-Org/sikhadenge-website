import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { emailInboxThreadIdentity } from "../inbound/inbox-service";

const threaded = emailInboxThreadIdentity({
  provider: "GOOGLE_GMAIL",
  connectionId: "conn-1",
  providerThreadId: "thread-1",
  providerMessageId: "message-1",
});
assert.deepEqual(threaded, {
  key: "GOOGLE_GMAIL:conn-1:THREAD:thread-1",
  provider: "GOOGLE_GMAIL",
  connectionId: "conn-1",
  threadId: "thread-1",
  threadKind: "THREAD",
});

const standalone = emailInboxThreadIdentity({
  provider: "GOOGLE_GMAIL",
  connectionId: null,
  providerThreadId: null,
  providerMessageId: "message-2",
});
assert.equal(standalone.threadKind, "MESSAGE");
assert.equal(standalone.threadId, "message-2");

const inbox = readFileSync("modules/email-automation/inbound/inbox-service.ts", "utf8");
const gmail = readFileSync("modules/email-automation/inbound/gmail-inbound-service.ts", "utf8");
const scheduler = readFileSync("modules/email-automation/automation/scheduler.ts", "utf8");
const inboxRoute = readFileSync("app/api/email/inbound/route.ts", "utf8");
const threadRoute = readFileSync("app/api/email/inbound/thread/route.ts", "utf8");
const replyRoute = readFileSync("app/api/email/inbound/reply/route.ts", "utf8");
const inboxPage = readFileSync("app/email/inbox/page.tsx", "utf8");
const inboxUi = readFileSync("modules/email-automation/ui/EmailInboxWorkspace.tsx", "utf8");

assert.match(inbox, /workspaceId:\s*input\.workspaceId/);
assert.match(inbox, /classification:\s*"INBOUND"/);
assert.match(inbox, /providerThreadId/);
assert.match(inbox, /connectionId/);
assert.match(threadRoute, /workspaceId:\s*access\.workspaceId/);
assert.match(inboxRoute, /workspaceId:\s*access\.workspaceId/);
assert.match(replyRoute, /workspaceId:a\.workspaceId/);
assert.match(gmail, /persistGmailInboundState/);
assert.match(gmail, /gmailInbound/);
assert.match(gmail, /EMAIL_INBOUND_SYNC_ENABLED/);
assert.match(gmail, /startHistoryId\?\.trim\(\)\s*\|\|\s*state\.historyId/);
assert.match(scheduler, /syncWatchedGmailMailboxes/);
assert.match(scheduler, /inboundSync/);
assert.match(inboxPage, /EmailInboxWorkspace/);
assert.match(inboxUi, /\/api\/email\/inbound\/thread/);
assert.match(inboxUi, /\/api\/email\/inbound\/gmail\/watch/);
assert.match(inboxUi, /\/api\/email\/inbound\/gmail\/sync/);
assert.match(inboxUi, /\/api\/email\/inbound\/reply/);

console.log("email E5 inbound inbox contracts: ok");
