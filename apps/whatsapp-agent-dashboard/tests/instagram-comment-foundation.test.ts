import assert from "node:assert/strict";

import { instagramCommentActionMode } from "../lib/instagram/comment-api-client";
import { verifyInstagramCommentCapabilityReadOnly } from "../lib/instagram/comment-capability-verifier";
import {
  instagramCommentIsSensitive,
  matchingInstagramCommentRules,
  parseInstagramCommentRules,
} from "../modules/channels/instagram/application/comment-rules";
import { normalizeInstagramCommentWebhooks } from "../modules/channels/instagram/mapping/comment-webhook";

async function main() {
  const payload = {
    object: "instagram",
    entry: [{
      id: "ig-account-1",
      time: 1788960000,
      field: "comments",
      value: {
        id: "comment-1",
        from: { id: "igsid-1", username: "learner" },
        text: "AI course fee please",
        media: { id: "media-1", media_product_type: "REELS" },
      },
    }],
  };
  const events = normalizeInstagramCommentWebhooks(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.commentId, "comment-1");
  assert.equal(events[0]?.accountId, "ig-account-1");
  assert.equal(events[0]?.mediaId, "media-1");
  assert.equal(events[0]?.commenterId, "igsid-1");

  const changesPayload = {
    object: "instagram",
    entry: [{
      id: "ig-account-1",
      time: 1788960000,
      changes: [{ field: "comments", value: { id: "comment-2", text: "hello", media: { id: "media-2" } } }],
    }],
  };
  assert.equal(normalizeInstagramCommentWebhooks(changesPayload)[0]?.commentId, "comment-2");

  const rules = parseInstagramCommentRules([
    {
      id: "course-fee",
      priority: 10,
      keywords: ["fee", "price"],
      publicReplyText: "Sent details in DM.",
      privateReplyText: "Here are the course details.",
      sensitiveKeywords: ["refund", "fraud"],
    },
  ]);
  assert.equal(matchingInstagramCommentRules(rules, events[0]!).length, 1);
  assert.equal(instagramCommentIsSensitive(rules[0]!, events[0]!), false);
  assert.equal(
    instagramCommentIsSensitive(rules[0]!, { ...events[0]!, text: "refund fraud" }),
    true,
  );

  assert.equal(instagramCommentActionMode({}), "disabled");
  assert.equal(instagramCommentActionMode({ INSTAGRAM_COMMENT_ACTION_MODE: "dry_run" }), "dry_run");

  let methods: string[] = [];
  const verification = await verifyInstagramCommentCapabilityReadOnly({
    env: {
      INSTAGRAM_ACCESS_TOKEN: "secret",
      INSTAGRAM_ACCOUNT_ID: "ig-account-1",
      INSTAGRAM_GRAPH_VERSION: "v23.0",
    },
    fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      methods.push(init?.method ?? "");
      if (methods.length === 1) {
        return new Response(JSON.stringify({ data: [{ id: "media-1" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch,
    now: () => new Date("2026-09-09T15:00:00Z"),
  });
  assert.equal(verification.verified, true);
  assert.deepEqual(methods, ["GET", "GET"]);
  assert.equal(verification.externalWriteSent, false);
  assert.equal(JSON.stringify(verification).includes("secret"), false);

  console.log("Instagram comment foundation tests passed.");
}

void main();
