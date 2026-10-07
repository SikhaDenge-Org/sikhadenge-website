import assert from "node:assert/strict";

import {
  effectiveMessage2ImageAssetId,
  parseMasterclassImageOutboundKey,
} from "../lib/automation/masterclass-image-flow";

const message1 = "a".repeat(32);
const message2 = "b".repeat(32);

assert.equal(
  effectiveMessage2ImageAssetId({
    message1ImageAssetId: message1,
    useSameImageForMessage2: true,
    message2ImageAssetId: message2,
  }),
  message1,
  "Same-image mode must use the Message 1 asset for the reminder.",
);

assert.equal(
  effectiveMessage2ImageAssetId({
    message1ImageAssetId: message1,
    useSameImageForMessage2: false,
    message2ImageAssetId: message2,
  }),
  message2,
  "Separate-image mode must use the Message 2 asset.",
);

assert.equal(
  effectiveMessage2ImageAssetId({
    message1ImageAssetId: null,
    useSameImageForMessage2: true,
    message2ImageAssetId: message2,
  }),
  null,
  "Same-image mode must not silently fall back to a dormant Message 2 asset.",
);

const enrollmentId = "c".repeat(32);
assert.deepEqual(
  parseMasterclassImageOutboundKey(`masterclass:${enrollmentId}:instant`),
  { enrollmentId, kind: "instant" },
);
assert.deepEqual(
  parseMasterclassImageOutboundKey(`masterclass:${enrollmentId}:reminder`),
  { enrollmentId, kind: "reminder" },
);
assert.equal(
  parseMasterclassImageOutboundKey("campaign:other:instant"),
  null,
);
assert.equal(
  parseMasterclassImageOutboundKey("masterclass:short:instant"),
  null,
);

console.log("Masterclass image flow tests passed.");
