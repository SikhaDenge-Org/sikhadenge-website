import assert from "node:assert/strict";

import {
  learningCategoryFromDecision,
  shouldCaptureLearningCandidate,
  validateProposedLearningAnswer,
} from "../lib/learning/policy";
import {
  normalizeLearningText,
  redactLearningText,
} from "../lib/learning/redaction";
import type { AgentDecision } from "../lib/agent/types";

const redacted = redactLearningText(
  "Call me on 9876543210, email ankit@example.com, OTP 123456 and card 4111 1111 1111 1111.",
);
assert.equal(redacted.redacted, true);
assert.ok(redacted.text.includes("[REDACTED_PHONE]"));
assert.ok(redacted.text.includes("[REDACTED_EMAIL]"));
assert.ok(redacted.text.includes("[REDACTED_OTP]"));
assert.ok(redacted.text.includes("[REDACTED_PAYMENT_NUMBER]"));
assert.ok(redacted.categories.includes("PAYMENT_NUMBER"));
assert.ok(!redacted.text.includes("9876543210"));
assert.ok(!redacted.text.includes("ankit@example.com"));
assert.ok(!redacted.text.includes("123456"));
assert.ok(!redacted.text.includes("4111"));
assert.ok(!redacted.text.includes("1111"));

const aadhaar = redactLearningText("Aadhaar number 1234 5678 9012");
assert.ok(aadhaar.text.includes("[REDACTED_AADHAAR]"));
assert.ok(aadhaar.categories.includes("AADHAAR"));
assert.ok(!aadhaar.text.includes("1234 5678 9012"));

const normalized = normalizeLearningText("  Approved   answer\nfor students.  ", 100);
assert.equal(normalized, "Approved answer for students.");
assert.equal(validateProposedLearningAnswer("Approved answer for the learner."), "Approved answer for the learner.");
assert.throws(() => validateProposedLearningAnswer("short"));

const baseDecision: AgentDecision = {
  shouldReply: true,
  reply: "A counselor will confirm this accurately.",
  language: "hinglish",
  intent: "FEES",
  confidence: 0.52,
  decisionSummary: "Approved fee information was unavailable.",
  requiresHuman: true,
  handoffReason: "MISSING_APPROVED_KNOWLEDGE",
  nextQuestion: null,
  leadUpdates: {},
  knowledgeReferences: [],
  safety: {
    safe: true,
    promptInjectionDetected: false,
    sensitiveDataDetected: false,
    blockedReason: null,
  },
  model: null,
};

assert.equal(shouldCaptureLearningCandidate(baseDecision), true);
assert.equal(learningCategoryFromDecision(baseDecision), "MISSING_KNOWLEDGE");
assert.equal(
  shouldCaptureLearningCandidate({
    ...baseDecision,
    handoffReason: "PAYMENT_OR_ACCOUNT_RISK",
  }),
  false,
);
assert.equal(
  shouldCaptureLearningCandidate({
    ...baseDecision,
    requiresHuman: false,
    handoffReason: null,
  }),
  false,
);

console.log("LEARNING_SMOKE_PASS=20");
