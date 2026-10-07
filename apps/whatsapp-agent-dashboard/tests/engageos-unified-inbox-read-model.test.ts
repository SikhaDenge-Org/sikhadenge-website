import assert from "node:assert/strict";

import { assertUnifiedInboxFilter } from "../modules/inbox/application/read-model";
import {
  legacyChannelFromSource,
  legacyConnectionId,
  mapLegacyConversationSummary,
} from "../modules/inbox/infrastructure/legacy-whatsapp-read-model";

const base = {
  id: "conv-1",
  status: "WAITING",
  agentMode: "REVIEW_REQUIRED",
  unreadCount: 2,
  lastMessageAt: new Date("2026-09-09T15:00:00Z"),
  contact: {
    id: "contact-1",
    displayName: "Learner",
    profileName: null,
    phone: "919999999999",
    email: "learner@example.com",
    city: "Varanasi",
  },
  assignedTo: { id: "user-1", name: "Counselor" },
  lead: {
    stage: "QUALIFIED",
    temperature: "HOT",
    score: 90,
    interestedCourse: "AI Expert",
    nextFollowUpAt: new Date("2026-09-10T05:00:00Z"),
  },
  messages: [{
    text: "Hello",
    type: "TEXT",
    direction: "INBOUND",
    messageTimestamp: new Date("2026-09-09T15:00:00Z"),
  }],
};

function main() {
  const whatsapp = mapLegacyConversationSummary(
    { ...base, source: "masterclass" },
    { whatsappPhoneNumberId: "12345" },
  );
  assert.equal(whatsapp.channel, "WHATSAPP");
  assert.equal(whatsapp.connectionId, "whatsapp:12345");
  assert.equal(whatsapp.status, "PENDING");
  assert.equal(whatsapp.agentMode, "REVIEW_REQUIRED");
  assert.equal(whatsapp.contact.displayName, "Learner");
  assert.equal(whatsapp.lastMessage?.direction, "INBOUND");
  assert.equal(whatsapp.lead?.stage, "QUALIFIED");

  const instagram = mapLegacyConversationSummary(
    { ...base, source: "instagram" },
    { instagramAccountId: "ig-123" },
  );
  assert.equal(instagram.channel, "INSTAGRAM");
  assert.equal(instagram.connectionId, "instagram:ig-123");

  const messenger = mapLegacyConversationSummary(
    { ...base, source: "Messenger" },
    { messengerPageId: "page-123" },
  );
  assert.equal(messenger.channel, "MESSENGER");
  assert.equal(messenger.connectionId, "messenger:page-123");

  assert.equal(legacyChannelFromSource(null), "WHATSAPP");
  assert.equal(legacyChannelFromSource("INSTAGRAM"), "INSTAGRAM");
  assert.equal(legacyChannelFromSource("messenger"), "MESSENGER");
  assert.equal(legacyConnectionId({ channel: "WHATSAPP" }), "whatsapp:legacy");
  assert.equal(legacyConnectionId({ channel: "INSTAGRAM" }), "instagram:legacy");
  assert.doesNotThrow(() => assertUnifiedInboxFilter({ limit: 100 }));
  assert.throws(() => assertUnifiedInboxFilter({ limit: 0 }), /between 1 and 100/);
  assert.throws(() => assertUnifiedInboxFilter({ limit: 101 }), /between 1 and 100/);

  console.log("EngageOS Unified Inbox read-model tests passed.");
}

main();
