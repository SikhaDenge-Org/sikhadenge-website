import assert from "node:assert/strict";

import { classifyCustomerFeedback } from "../lib/learning/conversation-feedback";

assert.equal(classifyCustomerFeedback("Thank you, reply helpful tha"), "positive");
assert.equal(classifyCustomerFeedback("Bilkul sahi bataya"), "positive");
assert.equal(classifyCustomerFeedback("Bahut achha, samajh aa gaya"), "positive");
assert.equal(classifyCustomerFeedback("Ye galat hai"), "negative");
assert.equal(classifyCustomerFeedback("Same question repeat kar rahe ho"), "negative");
assert.equal(classifyCustomerFeedback("Reply clear nahi hai"), "negative");
assert.equal(classifyCustomerFeedback("Mujhe fees janni hai"), null);
assert.equal(classifyCustomerFeedback("Haan"), null);

console.log("Conversation feedback classification tests passed: 8 cases.");
