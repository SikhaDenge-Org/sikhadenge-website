import assert from "node:assert/strict";

import { facebookPageCommentActionMode } from "../lib/messenger/page-comment-api-client";
import { matchingFacebookPageCommentRules, parseFacebookPageCommentRulesJson } from "../modules/channels/messenger/application/page-comment-rules";
import { normalizeFacebookPageCommentWebhooks } from "../modules/channels/messenger/mapping/page-comment-webhook";
import { evaluateMessengerResponseWindow } from "../modules/channels/messenger/policy/messenger-window-policy";

function main() {
  const payload = {
    object: "page",
    entry: [{
      id: "page-1",
      changes: [{
        field: "feed",
        value: {
          item: "comment",
          verb: "add",
          comment_id: "comment-1",
          post_id: "page-1_post-1",
          sender_id: "psid-1",
          sender_name: "Learner",
          message: "AI course details",
          created_time: 1788960000,
        },
      }],
    }],
  };
  const events = normalizeFacebookPageCommentWebhooks(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.pageId, "page-1");
  assert.equal(events[0]?.commentId, "comment-1");
  assert.equal(events[0]?.verb, "ADD");

  const rules = parseFacebookPageCommentRulesJson(JSON.stringify([{
    id: "ai-course",
    keywords: ["ai course"],
    publicReplyText: "Please check your inbox or contact our team.",
  }]));
  assert.equal(matchingFacebookPageCommentRules({ postId: events[0]?.postId ?? null, message: events[0]?.message ?? null, rules }).length, 1);

  const now = new Date("2026-09-09T15:00:00Z");
  assert.equal(evaluateMessengerResponseWindow({
    now,
    lastCustomerMessageAt: new Date("2026-09-09T14:30:00Z"),
    pageIsolationVerified: true,
    messagingCapabilityVerified: true,
    outboundPaused: false,
  }).allowed, true);
  assert.equal(evaluateMessengerResponseWindow({
    now,
    lastCustomerMessageAt: new Date("2026-09-08T14:00:00Z"),
    pageIsolationVerified: true,
    messagingCapabilityVerified: true,
    outboundPaused: false,
  }).allowed, false);

  assert.equal(facebookPageCommentActionMode({
    FACEBOOK_PAGE_COMMENT_ACTION_MODE: "live",
    FACEBOOK_PAGE_COMMENT_ACTION_KILL_SWITCH: "on",
  }), "disabled");
  assert.equal(facebookPageCommentActionMode({
    FACEBOOK_PAGE_COMMENT_ACTION_MODE: "dry_run",
    FACEBOOK_PAGE_COMMENT_ACTION_KILL_SWITCH: "off",
  }), "dry_run");
}

main();
