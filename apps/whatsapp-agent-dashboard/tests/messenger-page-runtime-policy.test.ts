import assert from "node:assert/strict";

import { sendFacebookPagePublicCommentReply } from "../lib/messenger/page-comment-api-client";
import { verifyMessengerPageCapabilityReadOnly } from "../lib/messenger/page-capability-verifier";
import { messengerPolicyEnforcementEnabled } from "../lib/messenger/outbound-policy-gate";

async function main() {
  const calls: Array<{ method: string; url: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ method: init?.method || "GET", url });
    if (url.includes("/conversations")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/published_posts")) {
      return new Response(JSON.stringify({ data: [{ id: "page-1_post-1" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("page-1_post-1/comments")) {
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ id: "page-1", name: "SikhaDenge" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const verified = await verifyMessengerPageCapabilityReadOnly({
    env: {
      MESSENGER_PAGE_ACCESS_TOKEN: "secret-token",
      MESSENGER_PAGE_ID: "page-1",
      MESSENGER_GRAPH_VERSION: "v23.0",
    },
    fetchImpl,
    now: () => new Date("2026-09-09T15:30:00Z"),
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.externalWriteSent, false);
  assert.equal(verified.conversationReadVerified, true);
  assert.equal(verified.commentReadVerified, true);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.method === "GET"));
  assert.equal(JSON.stringify(verified).includes("secret-token"), false);

  const missing = await verifyMessengerPageCapabilityReadOnly({ env: {} });
  assert.equal(missing.verified, false);
  assert.equal(messengerPolicyEnforcementEnabled({}), false);
  assert.equal(messengerPolicyEnforcementEnabled({ ENGAGEOS_MESSENGER_POLICY_ENFORCED: "true" }), true);

  let writeCalled = false;
  await assert.rejects(
    sendFacebookPagePublicCommentReply({
      commentId: "comment-1",
      message: "Thanks",
      env: {
        FACEBOOK_PAGE_COMMENT_ACTION_MODE: "live",
        FACEBOOK_PAGE_COMMENT_ACTION_KILL_SWITCH: "off",
        INTEGRATION_EXTERNAL_WRITES_ENABLED: "true",
        AUTOMATION_ACTIONS_ENABLED: "true",
        FACEBOOK_PAGE_COMMENT_WRITE_APPROVED: "false",
        MESSENGER_PAGE_ACCESS_TOKEN: "token",
        MESSENGER_GRAPH_VERSION: "v23.0",
      },
      fetchImpl: async () => {
        writeCalled = true;
        return new Response(JSON.stringify({ id: "reply-1" }), { status: 200 });
      },
    }),
    /WRITE_APPROVED=true/,
  );
  assert.equal(writeCalled, false);
}

void main();
