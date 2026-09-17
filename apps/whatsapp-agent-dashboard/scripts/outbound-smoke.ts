import assert from "node:assert/strict";
import {
  AgentMode,
  ConsentStatus,
  ConversationStatus,
  MessageActor,
  MessageType,
  TemplateStatus,
} from "@prisma/client";

import { getOutboundMode } from "../lib/meta/outbound-client";
import {
  evaluateOutboundPolicy,
  isServiceWindowOpen,
} from "../lib/outbound/policy";

const saved = {
  mode: process.env.WHATSAPP_OUTBOUND_MODE,
  approved: process.env.WHATSAPP_CUTOVER_APPROVED,
  acknowledgement: process.env.WHATSAPP_OUTBOUND_LIVE_ACK,
  killSwitch: process.env.WHATSAPP_OUTBOUND_KILL_SWITCH,
};

try {
  delete process.env.WHATSAPP_OUTBOUND_MODE;
  delete process.env.WHATSAPP_CUTOVER_APPROVED;
  delete process.env.WHATSAPP_OUTBOUND_LIVE_ACK;
  delete process.env.WHATSAPP_OUTBOUND_KILL_SWITCH;
  assert.equal(getOutboundMode(), "disabled");

  process.env.WHATSAPP_OUTBOUND_MODE = "dry_run";
  assert.equal(getOutboundMode(), "dry_run");

  process.env.WHATSAPP_OUTBOUND_MODE = "live";
  assert.equal(getOutboundMode(), "disabled");

  process.env.WHATSAPP_CUTOVER_APPROVED = "true";
  process.env.WHATSAPP_OUTBOUND_LIVE_ACK =
    "I_UNDERSTAND_LIVE_WHATSAPP_SENDS";
  assert.equal(getOutboundMode(), "live");

  process.env.WHATSAPP_OUTBOUND_KILL_SWITCH = "on";
  assert.equal(getOutboundMode(), "disabled");
} finally {
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore("WHATSAPP_OUTBOUND_MODE", saved.mode);
  restore("WHATSAPP_CUTOVER_APPROVED", saved.approved);
  restore("WHATSAPP_OUTBOUND_LIVE_ACK", saved.acknowledgement);
  restore("WHATSAPP_OUTBOUND_KILL_SWITCH", saved.killSwitch);
}

const now = new Date("2026-07-24T10:00:00.000Z");
const openUntil = new Date("2026-07-24T11:00:00.000Z");
const closedAt = new Date("2026-07-24T09:00:00.000Z");
assert.equal(isServiceWindowOpen(openUntil, now), true);
assert.equal(isServiceWindowOpen(closedAt, now), false);

const baseContext = {
  actor: MessageActor.COUNSELOR,
  agentMode: AgentMode.HUMAN,
  conversationStatus: ConversationStatus.OPEN,
  consentStatus: ConsentStatus.OPTED_IN,
  serviceWindowExpiresAt: openUntil,
  templateStatus: null,
};

const textAllowed = evaluateOutboundPolicy({
  context: baseContext,
  content: { kind: "text", text: "Hello learner" },
  now,
});
assert.equal(textAllowed.allowed, true);
assert.equal(textAllowed.messageType, MessageType.TEXT);

const textOutsideWindow = evaluateOutboundPolicy({
  context: { ...baseContext, serviceWindowExpiresAt: closedAt },
  content: { kind: "text", text: "Hello learner" },
  now,
});
assert.equal(textOutsideWindow.allowed, false);
assert.equal(
  textOutsideWindow.reason,
  "TEMPLATE_REQUIRED_OUTSIDE_SERVICE_WINDOW",
);

const templateAllowed = evaluateOutboundPolicy({
  context: {
    ...baseContext,
    serviceWindowExpiresAt: closedAt,
    templateStatus: TemplateStatus.APPROVED,
  },
  content: { kind: "template", templateId: "template-1", components: [] },
  now,
});
assert.equal(templateAllowed.allowed, true);
assert.equal(templateAllowed.messageType, MessageType.TEMPLATE);

const unapprovedTemplate = evaluateOutboundPolicy({
  context: {
    ...baseContext,
    templateStatus: TemplateStatus.PENDING,
  },
  content: { kind: "template", templateId: "template-1", components: [] },
  now,
});
assert.equal(unapprovedTemplate.allowed, false);
assert.equal(unapprovedTemplate.reason, "TEMPLATE_NOT_APPROVED");

const optedOut = evaluateOutboundPolicy({
  context: { ...baseContext, consentStatus: ConsentStatus.OPTED_OUT },
  content: { kind: "text", text: "Hello learner" },
  now,
});
assert.equal(optedOut.allowed, false);
assert.equal(optedOut.reason, "CONTACT_OPTED_OUT");

const aiBlocked = evaluateOutboundPolicy({
  context: {
    ...baseContext,
    actor: MessageActor.AI,
    agentMode: AgentMode.REVIEW_REQUIRED,
  },
  content: { kind: "text", text: "Hello learner" },
  now,
});
assert.equal(aiBlocked.allowed, false);
assert.equal(aiBlocked.reason, "AI_MODE_NOT_ACTIVE");

console.log("OUTBOUND_SMOKE_PASS=19");
