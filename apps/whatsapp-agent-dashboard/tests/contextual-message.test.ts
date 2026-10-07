import assert from "node:assert/strict";

import { generateAdmissionConversationReply } from "../lib/agent/admission-conversation-flow";
import {
  contextualizeAgentConversation,
  normalizeContextualCustomerMessage,
} from "../lib/agent/contextual-message";
import type { AgentHistoryMessage } from "../lib/agent/types";

function message(
  role: AgentHistoryMessage["role"],
  text: string,
): AgentHistoryMessage {
  return {
    role,
    text,
    createdAt: "2026-07-31T09:00:00.000Z",
  };
}

const linkQuestion = message(
  "assistant",
  "Admission se pehle ek baar Free Demo Class dekhna best rahega—main link share kar doon?",
);

for (const customerMessage of [
  "yes link",
  "Haan link",
  "link bhej do",
  "send link",
]) {
  assert.equal(
    normalizeContextualCustomerMessage({
      customerMessage,
      history: [linkQuestion, message("customer", customerMessage)],
    }),
    "yes",
    `Expected contextual demo-link confirmation for: ${customerMessage}`,
  );
}

assert.equal(
  normalizeContextualCustomerMessage({
    customerMessage: "yes link",
    history: [message("assistant", "Aapka main goal kya hai?")],
  }),
  "yes link",
  "The phrase must not be rewritten outside a demo-link question context.",
);

const repeatedCustomerMessage = message("customer", "link bhej do");
const recovered = contextualizeAgentConversation({
  customerMessage: repeatedCustomerMessage.text,
  history: [
    linkQuestion,
    message("customer", "yes link"),
    message(
      "assistant",
      "Bilkul ji. Main program aur admission ke baare mein guide karunga. Aapka current background kya hai?",
    ),
    message("customer", "yes link"),
    message(
      "assistant",
      "Bilkul ji. Main course details mein guide karunga. Aapka main goal kya hai?",
    ),
    repeatedCustomerMessage,
  ],
});

assert.equal(
  recovered.customerMessage,
  "yes",
  "A pending demo-link confirmation must be recovered after intervening fallback replies.",
);
assert.equal(
  recovered.history.filter((item) => item.role === "assistant").at(-1)?.text,
  "Main Free Demo Class ka link share kar doon?",
  "The recovered prompt must be canonicalized as a link-sharing question, not a demo-watched question.",
);
assert.equal(
  recovered.history.at(-1),
  repeatedCustomerMessage,
  "The current customer message must remain the final chronological history item.",
);

const directLinkDecision = generateAdmissionConversationReply({
  agentInput: {
    customerMessage: recovered.customerMessage,
    languageHint: "hinglish",
    conversationSummary: null,
    history: recovered.history,
    contact: { name: "Rahul Kumar" },
    lead: { stage: "DISCOVERY" },
  },
  classification: {
    language: "hinglish",
    intent: "DEMO_CLASS",
    confidence: 0.99,
    requiresHuman: false,
    handoffReason: null,
  },
});

assert.ok(
  directLinkDecision,
  "The recovered live sequence must produce an admission-flow reply.",
);
assert.match(
  directLinkDecision.reply,
  /https:\/\/www\.sikhadenge\.in/u,
  "The recovered live sequence must send the verified demo link.",
);
assert.doesNotMatch(
  directLinkDecision.reply,
  /Fee, current offer|call ke liye/iu,
  "A demo-link confirmation must not be routed into fee or call scheduling.",
);

console.log("Contextual demo link confirmation tests passed: 11 cases.");
