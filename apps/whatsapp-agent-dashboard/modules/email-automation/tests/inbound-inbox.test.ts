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

const sameProviderThreadDifferentConnection = emailInboxThreadIdentity({
  provider: "GOOGLE_GMAIL",
  connectionId: "conn-2",
  providerThreadId: "thread-1",
  providerMessageId: "message-1",
});
assert.notEqual(
  threaded.key,
  sameProviderThreadDifferentConnection.key,
  "Thread identity must remain isolated per provider connection.",
);

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
const safeIngest = readFileSync("modules/email-automation/inbound/workspace-safe-ingest.ts", "utf8");
const scheduler = readFileSync("modules/email-automation/automation/scheduler.ts", "utf8");
const inboxRoute = readFileSync("app/api/email/inbound/route.ts", "utf8");
const threadRoute = readFileSync("app/api/email/inbound/thread/route.ts", "utf8");
const replyRoute = readFileSync("app/api/email/inbound/reply/route.ts", "utf8");
const attachmentRoute = readFileSync("app/api/email/inbound/[messageId]/attachments/[attachmentId]/route.ts", "utf8");
const googleConnectRoute = readFileSync("app/api/email/google/connect/route.ts", "utf8");
const oauthScopes = readFileSync("modules/email-automation/providers/gmail/oauth-scopes.ts", "utf8");
const connectionService = readFileSync("modules/email-automation/application/connection-service.ts", "utf8");
const inboxPage = readFileSync("app/email/inbox/page.tsx", "utf8");
const inboxUi = readFileSync("modules/email-automation/ui/EmailInboxWorkspace.tsx", "utf8");

// E5 exit gate: threads and all reads remain scoped to the active workspace.
assert.match(inbox, /workspaceId:\s*input\.workspaceId/);
assert.match(inbox, /classification:\s*"INBOUND"/);
assert.match(inbox, /providerThreadId/);
assert.match(inbox, /connectionId/);
assert.match(threadRoute, /workspaceId:\s*access\.workspaceId/);
assert.match(inboxRoute, /workspaceId:\s*access\.workspaceId/);
assert.match(replyRoute, /workspaceId:a\.workspaceId/);
assert.match(attachmentRoute, /workspaceId:a\.workspaceId/);
assert.match(gmail, /where:\{id:input\.inboundMessageId,workspaceId:input\.workspaceId,provider:"GOOGLE_GMAIL"\}/);

// E5 exit gate: Gmail event replay is idempotent inside a workspace/provider boundary.
assert.match(safeIngest, /engageEmailInboundMessage\.findUnique/);
assert.match(safeIngest, /workspaceId_provider_providerMessageId/);
assert.match(safeIngest, /workspaceId:\s*input\.workspaceId,\s*provider,\s*providerMessageId/);
assert.match(safeIngest, /if \(prior\) return \{ message: prior, replayed: true \}/);
assert.match(gmail, /if \(result\.replayed\) replayed \+= 1; else imported \+= 1;/);
assert.match(gmail, /Prisma\.PrismaClientKnownRequestError && error\.code === "P2002"/);

// E5 exit gate: inbound processing cannot resolve contacts or automation across workspaces.
assert.match(safeIngest, /resolveWorkspaceSafeContactId/);
assert.match(safeIngest, /engageEmailInboundMessage\.findFirst/);
assert.match(safeIngest, /engageEmailAutomationEvent\.findMany/);
assert.match(safeIngest, /engageEmailAnalyticsEvent\.findMany/);
assert.match(safeIngest, /where:\s*\{ workspaceId, fromAddress:/);
assert.match(safeIngest, /where:\s*\{ workspaceId, contactId:/);
assert.match(safeIngest, /matches\.length === 1 \? matches\[0\]\.id : null/);
assert.doesNotMatch(safeIngest, /whatsAppContact\.findFirst\(\{\s*where:\s*\{\s*email/);

// E5 automation contracts: received and reply events are emitted from persisted inbound mail.
assert.match(safeIngest, /trigger:\s*"EMAIL_RECEIVED"/);
assert.match(safeIngest, /trigger:\s*"EMAIL_REPLIED"/);
assert.match(safeIngest, /trigger:\s*"NO_REPLY"/);
assert.match(safeIngest, /eventType:\s*"RECEIVED"/);
assert.match(safeIngest, /eventType:\s*"REPLIED"/);

// Gmail cursor/watch/scheduler contracts.
assert.match(gmail, /persistGmailInboundState/);
assert.match(gmail, /gmailInbound/);
assert.match(gmail, /EMAIL_INBOUND_SYNC_ENABLED/);
assert.match(gmail, /startHistoryId\?\.trim\(\)\s*\|\|\s*state\.historyId/);
assert.match(gmail, /ingestWorkspaceSafeInboundEmail/);
assert.doesNotMatch(gmail, /finalization\/platform-service/);
assert.match(scheduler, /syncWatchedGmailMailboxes/);
assert.match(scheduler, /inboundSync/);

// OAuth scope-upgrade gate: Inbox read access is explicit and incremental, never bundled silently.
assert.match(oauthScopes, /https:\/\/www\.googleapis\.com\/auth\/gmail\.readonly/);
assert.match(googleConnectRoute, /GMAIL_INBOUND_SCOPES/);
assert.match(googleConnectRoute, /include_granted_scopes",\s*"true"/);
assert.match(googleConnectRoute, /prompt",\s*"consent"/);
assert.match(googleConnectRoute, /scopeUpgrade:\s*enableInbound \? "GMAIL_INBOUND_READ" : null/);
assert.match(connectionService, /connection\.externalAccountId === oauth\.externalAccountId/);
assert.match(connectionService, /oauth\.credentials\.refreshToken \?\? previousCredentials\?\.refreshToken \?\? null/);

// Dedicated Email Inbox UX and guarded operations remain wired.
assert.match(inboxPage, /EmailInboxWorkspace/);
assert.match(inboxUi, /\/api\/email\/inbound\/thread/);
assert.match(inboxUi, /\/api\/email\/inbound\/gmail\/watch/);
assert.match(inboxUi, /\/api\/email\/inbound\/gmail\/sync/);
assert.match(inboxUi, /\/api\/email\/inbound\/reply/);
assert.match(inboxUi, /\/api\/email\/inbound\/\$\{event\.message\.id\}\/attachments/);
assert.match(inboxUi, /Reply all/);

console.log("email E5 inbound inbox exit-gate contracts: ok");
