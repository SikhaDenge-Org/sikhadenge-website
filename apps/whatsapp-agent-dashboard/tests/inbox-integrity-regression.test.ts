import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { normalizeWhatsAppWebhook } from "../lib/meta/webhook-normalizer";

const root = process.cwd();
const repository = fs.readFileSync(
  path.join(root, "lib/inbox/conversation-repository.ts"),
  "utf8",
);
const inbox = fs.readFileSync(
  path.join(root, "components/inbox/InboxDashboardV2.tsx"),
  "utf8",
);

assert.match(repository, /messageTimestamp: "desc"/);
assert.match(repository, /orderBy: \[\s*\{ messageTimestamp: "desc" \},\s*\{ createdAt: "desc" \}/);
assert.match(repository, /createdAt: "desc"/);
assert.match(repository, /chronologicalMessages[\s\S]*\.reverse\(\)/);
assert.doesNotMatch(repository, /orderBy: \{ messageTimestamp: "asc" \}[\s\S]*take: 200/);

assert.match(inbox, /detailRequestSeqRef/);
assert.match(inbox, /selectedIdRef\.current !== conversationId/);
assert.match(inbox, /requestSeq === detailRequestSeqRef\.current/);
assert.match(inbox, /selectedIdRef\.current === activeId/);
assert.match(inbox, /formatMessageDay/);
assert.match(inbox, /✓✓ Delivered/);
assert.match(inbox, /✓✓ Read/);
assert.doesNotMatch(inbox, /sx-daydivider"><span>Today<\/span>/);

const buttonEvents = normalizeWhatsAppWebhook({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: {
    contacts: [{ profile: { name: "CI User" }, wa_id: "919999999999" }],
    messages: [{ from: "919999999999", id: "wamid.button", timestamp: "1700000000", type: "button", button: { text: "Yes", payload: "YES" } }],
  } }] }],
});
assert.equal(buttonEvents[0]?.kind, "message");
assert.equal(buttonEvents[0]?.kind === "message" ? buttonEvents[0].message.text : null, "Yes");

const unknownEvents = normalizeWhatsAppWebhook({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: {
    messages: [{ from: "919999999999", id: "wamid.unknown", timestamp: "1700000001", type: "unknown", errors: [{ details: "Message type is not currently supported" }] }],
  } }] }],
});
assert.match(unknownEvents[0]?.kind === "message" ? unknownEvents[0].message.text || "" : "", /not currently supported/);

console.log("Inbox integrity regression policy: PASS");