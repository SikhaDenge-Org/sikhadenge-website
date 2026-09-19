import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync("../../.github/workflows/whatsapp-agent-production-batch1.yml", "utf8");
const ci = readFileSync("../../.github/workflows/whatsapp-agent-ci.yml", "utf8");

assert.match(workflow, /permissions:\s*\n\s*contents: read/);
assert.match(workflow, /group: whatsapp-agent-production/);
assert.match(workflow, /cancel-in-progress: false/);
assert.match(workflow, /environment: whatsapp-agent-production/);
assert.match(workflow, /release_sha:/);
assert.match(workflow, /\[\[ "\$TARGET_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$TARGET_SHA"/);
assert.match(workflow, /PRESTAGE_RELEASE_REF_MISMATCH/);
assert.match(workflow, /PRESTAGE_TRACKED_WORKTREE_DIRTY/);
assert.match(workflow, /PRESTAGE_LIVE_SHA_NOT_ANCESTOR/);
assert.match(workflow, /StrictHostKeyChecking=yes/);
assert.match(workflow, /Verify production evidence integrity/);
assert.match(workflow, /success_required=\(/);
assert.match(workflow, /batch-result\.txt/);
assert.match(workflow, /AUTOMATIC_ROLLBACK_COMPLETED/);
assert.match(workflow, /test -s production-evidence\/rollback-evidence\.txt/);
assert.match(workflow, /sha256sum \* > SHA256SUMS\.txt/);
assert.match(workflow, /sha256sum --check SHA256SUMS\.txt/);
assert.match(workflow, /if-no-files-found: error/);
assert.match(ci, /permissions:\s*\n\s*contents: read/);
assert.match(ci, /concurrency:/);
console.log("Phase18 release deployment governance certification: PASS");
