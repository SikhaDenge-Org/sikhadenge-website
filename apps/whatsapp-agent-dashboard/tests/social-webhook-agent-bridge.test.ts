import assert from "node:assert/strict";

import { extractSocialInboundMessageIds } from "../lib/agent/social-webhook-agent-bridge";

const instagramPayload = {
  object: "instagram",
  entry: [
    {
      messaging: [
        { message: { mid: "ig-mid-1", text: "Hello" } },
        { message: { mid: "ig-echo", text: "Echo", is_echo: true } },
        { postback: { mid: "ig-postback-1", title: "Free Demo" } },
        { message: { mid: "ig-mid-1", text: "Duplicate" } },
      ],
    },
  ],
};

assert.deepEqual(
  extractSocialInboundMessageIds({
    payload: instagramPayload,
    channel: "instagram",
  }),
  ["ig-mid-1", "ig-postback-1"],
  "Instagram bridge must collect unique customer message IDs and ignore echoes.",
);

const messengerPayload = {
  object: "page",
  entry: [
    {
      messaging: [
        { message: { mid: "messenger-mid-1", text: "Hi" } },
        { message: { mid: "messenger-echo", text: "Echo", is_echo: true } },
        { postback: { mid: "messenger-postback-1", title: "Demo Class" } },
        { reaction: { mid: "messenger-reaction-1", emoji: "👍" } },
      ],
    },
  ],
};

assert.deepEqual(
  extractSocialInboundMessageIds({
    payload: messengerPayload,
    channel: "messenger",
  }),
  [
    "messenger-mid-1",
    "messenger-postback-1",
    "messenger-reaction-1",
  ],
  "Messenger bridge must collect text, postback and reaction message IDs.",
);

assert.deepEqual(
  extractSocialInboundMessageIds({
    payload: messengerPayload,
    channel: "instagram",
  }),
  [],
  "A Messenger payload must never be routed into the Instagram agent.",
);

assert.deepEqual(
  extractSocialInboundMessageIds({
    payload: instagramPayload,
    channel: "messenger",
  }),
  [],
  "An Instagram payload must never be routed into the Messenger agent.",
);

console.log("Social webhook agent bridge tests passed: 4 cases.");
