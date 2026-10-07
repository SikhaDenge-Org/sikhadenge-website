import assert from "node:assert/strict";

import { generateAdmissionConversationReply } from "../lib/agent/admission-conversation-flow";
import type {
  AgentHistoryMessage,
  AgentInput,
  RuleClassification,
} from "../lib/agent/types";

const classification: RuleClassification = {
  language: "hinglish",
  intent: "COURSE_DISCOVERY",
  confidence: 0.95,
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
    createdAt: new Date("2026-07-31T06:00:00.000Z").toISOString(),
  };
}

function replyFor(input: Partial<AgentInput> & { customerMessage: string }) {
  return generateAdmissionConversationReply({
    agentInput: {
      customerMessage: input.customerMessage,
      languageHint: input.languageHint ?? "hinglish",
      conversationSummary: input.conversationSummary ?? null,
      history: input.history ?? [],
      contact: input.contact ?? { name: "Rahul Kumar" },
      lead: input.lead ?? { stage: "NEW" },
    },
    classification,
  });
}

function requireReply(
  input: Partial<AgentInput> & { customerMessage: string },
) {
  const result = replyFor(input);
  assert.ok(result, `Expected a flow reply for: ${input.customerMessage}`);
  assert.doesNotMatch(result.reply, /AI\s+assistant|chatbot|bot\s+hoon/iu);
  return result;
}

function assertOneQuestion(text: string) {
  assert.equal(
    (text.match(/\?/g) ?? []).length,
    1,
    `Expected exactly one question, received: ${text}`,
  );
}

{
  const result = requireReply({ customerMessage: "Hi" });
  assert.match(result.reply, /^Hi Rahul ji 😊/u);
  assert.match(result.reply, /Facebook\/Instagram/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({
    customerMessage:
      "Instagram par dekha tha, ChatGPT thoda use kiya hai, freelancing ke liye seekhna hai aur abhi start karna hai",
  });
  assert.equal(result.leadUpdates.experienceLevel, "SOME_EXPERIENCE");
  assert.equal(result.leadUpdates.goal, "FREELANCING");
  assert.equal(result.leadUpdates.joiningTimeline, "IMMEDIATELY");
  assert.match(result.reply, /Demo Class/iu);
  assert.doesNotMatch(result.reply, /AI mein bilkul beginner/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({
    customerMessage: "Instagram par dekha tha",
    history: [
      history(
        "assistant",
        "Aapne hamare program ke baare mein Facebook/Instagram par dekha tha ya kisi ne recommend kiya?",
      ),
    ],
  });
  assert.match(result.reply, /bilkul beginner|ChatGPT\/Gemini/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({
    customerMessage: "Main bilkul beginner hoon",
    history: [
      history(
        "assistant",
        "Aap AI mein bilkul beginner hain, ya ChatGPT/Gemini jaise tools pehle thoda use kiye hain?",
      ),
    ],
  });
  assert.equal(result.leadUpdates.experienceLevel, "BEGINNER");
  assert.match(result.reply, /online earning, freelancing, job/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({
    customerMessage: "Mera goal freelancing hai",
    history: [
      history(
        "assistant",
        "Aap AI mainly online earning, freelancing, job ya apne business ke liye seekhna chahte hain?",
      ),
    ],
    lead: { stage: "DISCOVERY", experienceLevel: "BEGINNER" },
  });
  assert.equal(result.leadUpdates.goal, "FREELANCING");
  assert.match(result.reply, /kab tak start/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({
    customerMessage: "Pehle sirf details explore kar raha hoon",
    history: [
      history(
        "assistant",
        "Aap learning kab tak start karna chahenge—abhi, is month, next month, ya filhaal details explore kar rahe hain?",
      ),
    ],
    lead: {
      stage: "DISCOVERY",
      experienceLevel: "BEGINNER",
      goal: "FREELANCING",
    },
  });
  assert.equal(result.leadUpdates.joiningTimeline, "DETAILS_ONLY");
  assert.match(result.reply, /requirement clear/iu);
  assert.match(result.reply, /link share/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({
    customerMessage: "Main beginner hoon, job ke liye seekhna hai aur isi month start karunga",
    history: [
      history(
        "assistant",
        "Aapne hamare program ke baare mein Facebook/Instagram par dekha tha ya kisi ne recommend kiya?",
      ),
    ],
  });
  assert.equal(result.leadUpdates.experienceLevel, "BEGINNER");
  assert.equal(result.leadUpdates.goal, "JOB");
  assert.equal(result.leadUpdates.joiningTimeline, "THIS_MONTH");
  assert.match(result.reply, /Demo Class/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({ customerMessage: "Course ki fees kitni hai?" });
  assert.equal(result.intent, "FEES");
  assert.match(result.reply, /Demo Class dekh li hai/iu);
  assert.doesNotMatch(result.reply, /₹\s*\d|\b\d{3,}\b/u);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({ customerMessage: "Bas fee bata do" });
  assert.equal(result.leadUpdates.counselorRequested, true);
  assert.match(result.reply, /Admission Team call/iu);
  assert.match(result.reply, /11 AM.*2 PM.*5 PM.*8 PM/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({
    customerMessage: "Haan",
    history: [
      history("assistant", "Kya aapne hamari Free Demo Class dekh li hai?"),
    ],
  });
  assert.equal(result.intent, "FEES");
  assert.equal(result.leadUpdates.counselorRequested, true);
  assert.match(result.reply, /call ke liye/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({
    customerMessage: "Nahi",
    history: [
      history("assistant", "Kya aapne hamari Free Demo Class dekh li hai?"),
    ],
  });
  assert.match(result.reply, /Demo Class ka link share/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({
    customerMessage: "2 PM se 5 PM",
    history: [
      history(
        "assistant",
        "Aaj call ke liye 11 AM–2 PM, 2 PM–5 PM ya 5 PM–8 PM mein se kaunsa time convenient rahega?",
      ),
    ],
  });
  assert.equal(result.leadUpdates.classAvailability, "2 PM se 5 PM");
  assert.equal(result.leadUpdates.counselorRequested, true);
  assert.match(result.reply, /time note kar liya/iu);
  assert.doesNotMatch(result.reply, /\?/u);
}

{
  const result = requireReply({ customerMessage: "Demo class dekhna hai" });
  assert.equal(result.intent, "DEMO_CLASS");
  assert.match(result.reply, /link share kar doon/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({
    customerMessage: "Haan",
    history: [
      history("assistant", "Main Free Demo Class ka link share kar doon?"),
    ],
  });
  assert.match(result.reply, /https:\/\/www\.sikhadenge\.in/u);
  assert.match(result.reply, /Done/iu);
  assert.doesNotMatch(result.reply, /\?/u);
}

{
  const result = requireReply({
    customerMessage: "Done",
    history: [
      history(
        "assistant",
        "Aap https://www.sikhadenge.in par Demo Class dekh sakte hain. Demo complete hone ke baad Done likh dijiyega.",
      ),
    ],
  });
  assert.match(result.reply, /Welcome back/iu);
  assert.match(result.reply, /Demo Class aapko kaisi lagi/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({
    customerMessage: "Bahut achhi thi, samajh aa gaya",
    history: [history("assistant", "Waise Demo Class aapko kaisi lagi?")],
  });
  assert.match(result.reply, /course details.*fee.*batch timing.*job support/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({
    customerMessage: "Mujhe doubt hai, clear nahi hua",
    history: [history("assistant", "Waise Demo Class aapko kaisi lagi?")],
  });
  assert.match(result.reply, /doubt/iu);
  assertOneQuestion(result.reply);
}

{
  const result = requireReply({ customerMessage: "100% job guarantee hai?" });
  assert.match(result.reply, /final selection/iu);
  assert.doesNotMatch(result.reply, /100% job guarantee milegi/iu);
  assert.equal(result.leadUpdates.goal, "JOB");
}

{
  const result = requireReply({ customerMessage: "Mujhe sirf job chahiye" });
  assert.equal(result.leadUpdates.goal, "JOB");
  assert.match(result.reply, /kis field ya role/iu);
  assertOneQuestion(result.reply);
}

console.log("Admission conversation flow tests passed: 19 cases.");
