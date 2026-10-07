import assert from "node:assert/strict";

import { generateMasterclassCommunityReply } from "../lib/agent/masterclass-community-flow";
import type {
  AgentHistoryMessage,
  AgentInput,
  RuleClassification,
} from "../lib/agent/types";

const classification: RuleClassification = {
  language: "hinglish",
  intent: "DEMO_CLASS",
  confidence: 0.96,
  requiresHuman: false,
  handoffReason: null,
};

function history(
  role: AgentHistoryMessage["role"],
  text: string,
): AgentHistoryMessage {
  return {
    role,
    text,
    createdAt: new Date("2026-08-03T09:00:00.000Z").toISOString(),
  };
}

function replyFor(input: Partial<AgentInput> & { customerMessage: string }) {
  return generateMasterclassCommunityReply({
    agentInput: {
      customerMessage: input.customerMessage,
      languageHint: input.languageHint ?? "hinglish",
      conversationSummary: input.conversationSummary ?? null,
      history: input.history ?? [],
      contact: input.contact ?? { name: "Rahul Kumar" },
      lead: input.lead ?? { stage: "NEW" },
      masterclass: input.masterclass ?? null,
    },
    classification,
  });
}

{
  const result = generateMasterclassCommunityReply({
    agentInput: {
      customerMessage: "Hi",
      history: [],
      lead: { stage: "NEW" },
    },
    classification: { ...classification, intent: "GREETING" },
  });
  assert.equal(result, null, "Generic non-masterclass greetings must not hijack admission chat.");
}

{
  const result = replyFor({
    customerMessage: "Hi",
    lead: {
      stage: "NEW",
      interestedCourse: "Become AI Expert Free Masterclass",
    },
  });
  assert.ok(result);
  assert.match(result.reply, /Hi Rahul/iu);
  assert.match(result.reply, /06 August 2026/iu);
  assert.match(result.reply, /08:00 PM IST/iu);
  assert.match(result.reply, /DWeqmllf2x064XjeOP4yRd/u);
  assert.match(result.reply, /JOINED/iu);
  assert.doesNotMatch(result.reply, /limited\s+seats/iu);
  assert.equal(result.leadUpdates.joiningTimeline, "COMMUNITY_LINK_SENT");
}

{
  const result = replyFor({
    customerMessage: "JOINED",
    history: [
      history(
        "assistant",
        "WhatsApp Community join karke yahin JOINED reply kar dijiye.",
      ),
    ],
  });
  assert.ok(result);
  assert.equal(result.intent, "ENROLLMENT");
  assert.equal(result.leadUpdates.joiningTimeline, "COMMUNITY_JOINED");
  assert.match(result.reply, /Job \/ Career Growth/iu);
  assert.match(result.reply, /General Learning/iu);
}

{
  const result = replyFor({
    customerMessage: "3",
    history: [
      history(
        "assistant",
        "Aap AI mainly kis purpose ke liye seekhna chahte hain? 1. Job / Career Growth 2. Business Growth 3. Freelancing 4. Daily Work Productivity 5. Content Creation 6. General Learning",
      ),
    ],
    lead: {
      stage: "DISCOVERY",
      interestedCourse: "Become AI Expert – Free Masterclass",
      joiningTimeline: "COMMUNITY_JOINED",
    },
  });
  assert.ok(result);
  assert.equal(result.leadUpdates.goal, "FREELANCING");
  assert.equal(result.leadUpdates.joiningTimeline, "COMMUNITY_JOINED");
  assert.match(result.reply, /freelancing/iu);
}

{
  const result = replyFor({
    customerMessage: "Masterclass free hai?",
  });
  assert.ok(result);
  assert.equal(result.intent, "FEES");
  assert.match(result.reply, /bilkul free/iu);
  assert.match(result.reply, /DWeqmllf2x064XjeOP4yRd/u);
}

{
  const result = replyFor({
    customerMessage: "Masterclass kab hai aur kitne baje?",
  });
  assert.ok(result);
  assert.equal(result.intent, "BATCH_SCHEDULE");
  assert.match(result.reply, /06 August 2026/iu);
  assert.match(result.reply, /08:00 PM IST/iu);
}

{
  const result = replyFor({
    customerMessage: "Masterclass me kya sikhaya jayega?",
  });
  assert.ok(result);
  assert.equal(result.intent, "COURSE_DETAILS");
  assert.match(result.reply, /AI tools ka practical use/iu);
  assert.match(result.reply, /AI learning roadmap/iu);
}

{
  const result = replyFor({
    customerMessage: "Community link open nahi ho raha",
  });
  assert.ok(result);
  assert.match(result.reply, /WhatsApp app update/iu);
  assert.match(result.reply, /Chrome browser/iu);
  assert.match(result.reply, /screenshot/iu);
}

{
  const result = replyFor({
    customerMessage: "Masterclass kab hai aur kitne baje?",
    masterclass: {
      name: "Free AI Expert Masterclass",
      dateLabel: "Monday, 31 August",
      timeLabel: "09:15 PM",
      communityUrl:
        "https://chat.whatsapp.com/SnapshotConsistency123",
    },
  });

  assert.ok(result);
  assert.equal(result.intent, "BATCH_SCHEDULE");
  assert.match(result.reply, /Monday, 31 August/iu);
  assert.match(result.reply, /09:15 PM/iu);
  assert.match(result.reply, /SnapshotConsistency123/u);
  assert.doesNotMatch(result.reply, /06 August 2026/iu);
  assert.doesNotMatch(result.reply, /08:00 PM IST/iu);
}

console.log("PASS: masterclass-community-flow");
