import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateGroundedSend } from "../modules/ai/orchestration/grounded-send-gate";

const live = readFileSync("lib/agent/live-agent-service.ts", "utf8");
const gate = readFileSync("lib/agent/grounded-lifecycle-gate.ts", "utf8");
const policyModule = readFileSync("modules/ai/orchestration/grounded-send-gate.ts", "utf8");
const knowledge = readFileSync("lib/agent/knowledge.ts", "utf8");

assert.match(live, /evaluateAgentDecisionForExternalSend/);
assert.match(live, /groundedDecision\.route !== "AUTO_SEND"/);
assert.match(live, /AI_APPROVAL_REQUIRED/);
assert.match(live, /AI_GROUNDED_HANDOFF/);
assert.match(live, /AgentMode\.REVIEW_REQUIRED/);
assert.match(live, /idempotencyKey:\s*`agent-reply:\$\{message\.id\}`/);
assert.match(live, /queueOutboundMessage/);
assert.match(live, /dispatchOutboundMessage/);
const gateIndex = live.indexOf("groundedDecision.route !== \"AUTO_SEND\"");
const queueCallIndex = live.indexOf("await queueOutboundMessage({", gateIndex);
assert.ok(gateIndex >= 0 && queueCallIndex > gateIndex);
assert.match(policyModule, /ENGAGEOS_GROUNDED_AI_POLICY_ENFORCED/);
assert.match(gate, /ENGAGEOS_AI_AUTO_SEND_THRESHOLD/);
assert.match(gate, /ENGAGEOS_AI_APPROVAL_THRESHOLD/);
assert.match(knowledge, /status:\s*KnowledgeStatus\.APPROVED/);
assert.match(knowledge, /effectiveFrom/);
assert.match(knowledge, /effectiveTo/);

const grounded = evaluateGroundedSend({ enabled: true, intent: "FEES", confidence: 0.96, sourceReferenceIds: ["chunk-1"], safetyPassed: true, sensitive: false, requiresHuman: false });
assert.equal(grounded.route, "AUTO_SEND");
assert.equal(grounded.allowedToAutoSend, true);

const missingSource = evaluateGroundedSend({ enabled: true, intent: "FEES", confidence: 0.99, sourceReferenceIds: [], safetyPassed: true, sensitive: false, requiresHuman: false });
assert.equal(missingSource.route, "HANDOFF");
assert.equal(missingSource.allowedToAutoSend, false);

const approval = evaluateGroundedSend({ enabled: true, intent: "GREETING", confidence: 0.8, sourceReferenceIds: [], safetyPassed: true, sensitive: false, requiresHuman: false });
assert.equal(approval.route, "APPROVAL");
assert.equal(approval.allowedToAutoSend, false);

const disabled = evaluateGroundedSend({ enabled: false, intent: "GREETING", confidence: 0.99, sourceReferenceIds: [], safetyPassed: true, sensitive: false, requiresHuman: false });
assert.equal(disabled.route, "LEGACY_BYPASS");
assert.equal(disabled.allowedToAutoSend, true);
assert.match(live, /groundedDecision\.route !== "AUTO_SEND"/);

console.log("Phase11 AI production certification: PASS");
