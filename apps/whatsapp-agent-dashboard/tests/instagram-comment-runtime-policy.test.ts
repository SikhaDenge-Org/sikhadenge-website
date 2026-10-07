import assert from "node:assert/strict";

import {
  instagramCommentAutomationEnabled,
  instagramPrivateReplyWindowMs,
} from "../lib/instagram/comment-automation-runtime";
import { evaluateInstagramCommentAutomation } from "../modules/channels/instagram/policy/comment-private-reply";

function main() {
  assert.equal(instagramCommentAutomationEnabled({}), false);
  assert.equal(instagramCommentAutomationEnabled({ INSTAGRAM_COMMENT_AUTOMATION_ENABLED: "true" }), true);
  assert.equal(instagramPrivateReplyWindowMs({}), 604_800_000);
  assert.equal(
    instagramPrivateReplyWindowMs({ INSTAGRAM_COMMENT_PRIVATE_REPLY_WINDOW_MS: "9999999999" }),
    604_800_000,
  );

  const created = new Date("2026-09-01T00:00:00Z");
  const allowed = evaluateInstagramCommentAutomation({
    commentId: "comment-1",
    commentCreatedAt: created,
    now: new Date("2026-09-05T00:00:00Z"),
    privateReplyWindowMs: 604_800_000,
    matchedRule: true,
    complaintOrSensitive: false,
    suppressed: false,
    publicReplySupported: true,
    privateReplySupported: true,
    initialPrivateReplyAlreadySent: false,
  });
  assert.deepEqual(allowed.actions, ["PUBLIC_REPLY", "PRIVATE_REPLY"]);

  const expired = evaluateInstagramCommentAutomation({
    commentId: "comment-1",
    commentCreatedAt: created,
    now: new Date("2026-09-09T00:00:01Z"),
    privateReplyWindowMs: 604_800_000,
    matchedRule: true,
    complaintOrSensitive: false,
    suppressed: false,
    publicReplySupported: true,
    privateReplySupported: true,
    initialPrivateReplyAlreadySent: false,
  });
  assert.deepEqual(expired.actions, ["PUBLIC_REPLY"]);

  const sensitive = evaluateInstagramCommentAutomation({
    commentId: "comment-1",
    commentCreatedAt: created,
    now: created,
    privateReplyWindowMs: 604_800_000,
    matchedRule: true,
    complaintOrSensitive: true,
    suppressed: false,
    publicReplySupported: true,
    privateReplySupported: true,
    initialPrivateReplyAlreadySent: false,
  });
  assert.deepEqual(sensitive.actions, ["HUMAN_REVIEW"]);

  console.log("Instagram comment runtime policy tests passed.");
}

main();
