import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
assert.match(repository, /createdAt: "desc"/);
assert.match(repository, /chronologicalMessages[\s\S]*\.reverse\(\)/);
assert.doesNotMatch(repository, /orderBy: \{ messageTimestamp: "asc" \}[\s\S]*take: 200/);

assert.match(inbox, /detailRequestSeqRef/);
assert.match(inbox, /selectedIdRef\.current !== conversationId/);
assert.match(inbox, /selectedIdRef\.current === activeId/);
assert.match(inbox, /formatMessageDay/);
assert.match(inbox, /✓✓ Delivered/);
assert.match(inbox, /✓✓ Read/);
assert.doesNotMatch(inbox, /sx-daydivider"><span>Today<\/span>/);

console.log("Inbox integrity regression policy: PASS");