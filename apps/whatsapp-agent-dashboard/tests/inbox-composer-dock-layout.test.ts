import assert from "node:assert/strict";

import {
  getInboxComposerDockLayout,
  INBOX_COMPOSER_COMPACT_BREAKPOINT,
  INBOX_COMPOSER_DOCK_Z_INDEX,
} from "../components/inbox/inbox-composer-dock-layout";

const compactLayout = getInboxComposerDockLayout(
  INBOX_COMPOSER_COMPACT_BREAKPOINT - 1,
);
assert.equal(
  compactLayout.compact,
  true,
  "Widths below 720px must use the compact composer layout.",
);
assert.equal(
  compactLayout.rowTemplate,
  "auto minmax(0, 1fr) auto",
  "Compact mode must reserve only the attachment, editor and send columns.",
);

const expandedLayout = getInboxComposerDockLayout(
  INBOX_COMPOSER_COMPACT_BREAKPOINT,
);
assert.equal(
  expandedLayout.compact,
  false,
  "The wider layout must return as soon as the viewport reaches 720px.",
);
assert.equal(
  expandedLayout.rowTemplate,
  "auto minmax(0, 1fr) auto auto auto",
  "Expanded mode must restore the template and supporting controls.",
);

assert.ok(
  INBOX_COMPOSER_DOCK_Z_INDEX < 1200,
  "The fixed composer must remain below the template modal overlay.",
);

console.log("Inbox composer dock layout tests passed: 5 assertions.");
