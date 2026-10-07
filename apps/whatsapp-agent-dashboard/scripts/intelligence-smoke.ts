import assert from "node:assert/strict";
import { LeadStage, LeadTemperature } from "@prisma/client";

import { applyLeadIntelligence } from "../lib/agent/lead-intelligence";
import { buildConversationMemory } from "../lib/agent/memory";
import type { AgentDecision, AgentInput } from "../lib/agent/types";

const baseline = {
  stage: LeadStage.NEW,
  temperature: LeadTemperature.COLD,
  score: 0,
  occupation: null,
  experienceLevel: null,
  goal: null,
  interestedCourse: null,
  joiningTimeline: null,
  classAvailability: null,
  feeUnderstood: false,
  counselorRequested: false,
};

const discovery = applyLeadIntelligence(baseline, {
  interestedCourse: "Become AI Expert",
  goal: "Career growth",
});
assert.equal(discovery.stage, LeadStage.DISCOVERY);
assert.equal(discovery.temperature, LeadTemperature.WARM);
assert.equal(discovery.score, 38);

const qualified = applyLeadIntelligence(discovery, {
  joiningTimeline: "This month",
  classAvailability: "8-10 PM",
});
assert.equal(qualified.stage, LeadStage.QUALIFIED);
assert.equal(qualified.temperature, LeadTemperature.WARM);
assert.equal(qualified.score, 66);
assert.ok(qualified.qualifiedAt instanceof Date);

const counselor = applyLeadIntelligence(qualified, {
  counselorRequested: true,
});
assert.equal(counselor.stage, LeadStage.COUNSELOR_ASSIGNED);
assert.equal(counselor.temperature, LeadTemperature.HOT);
assert.equal(counselor.score, 76);

const locked = applyLeadIntelligence(
  { ...baseline, stage: LeadStage.ENROLLED },
  { counselorRequested: true },
);
assert.equal(locked.stage, LeadStage.ENROLLED);

const agentInput: AgentInput = {
  customerMessage:
    "Mujhe Become AI Expert course join karna hai. OTP 123456 aur card 4111 1111 1111 1111 hai.",
  contact: { name: "Ankit", city: "Lucknow" },
  lead: {
    stage: qualified.stage,
    temperature: qualified.temperature,
    score: qualified.score,
    interestedCourse: qualified.interestedCourse,
    goal: qualified.goal,
    joiningTimeline: qualified.joiningTimeline,
  },
};

const decision: AgentDecision = {
  shouldReply: true,
  reply: "Counselor will help.",
  language: "hinglish",
  intent: "ENROLLMENT",
  confidence: 0.91,
  decisionSummary: "Customer wants to enroll this month.",
  requiresHuman: false,
  handoffReason: null,
  nextQuestion: null,
  leadUpdates: {},
  knowledgeReferences: [],
  safety: {
    safe: true,
    promptInjectionDetected: false,
    sensitiveDataDetected: true,
    blockedReason: null,
  },
  model: null,
};

const memory = buildConversationMemory({ agentInput, decision });
assert.ok(memory.includes("Become AI Expert"));
assert.ok(memory.includes("Career growth"));
assert.ok(!memory.includes("123456"));
assert.ok(!memory.includes("4111 1111 1111 1111"));
assert.ok(memory.includes("[REDACTED]"));

console.log("INTELLIGENCE_SMOKE_PASS=15");
