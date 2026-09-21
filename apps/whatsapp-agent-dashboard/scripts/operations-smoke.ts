import assert from "node:assert/strict";
import {
  AgentMode,
  ConversationStatus,
  LeadTemperature,
} from "@prisma/client";

import {
  canTransitionAgentMode,
  canTransitionConversationStatus,
  priorityBand,
  queuePriorityScore,
  queueSlaState,
} from "../lib/operations/policy";

assert.equal(
  canTransitionConversationStatus(ConversationStatus.OPEN, ConversationStatus.WAITING),
  true,
);
assert.equal(
  canTransitionConversationStatus(ConversationStatus.CLOSED, ConversationStatus.RESOLVED),
  false,
);
assert.equal(canTransitionAgentMode(AgentMode.AI, AgentMode.HUMAN), true);
assert.equal(canTransitionAgentMode(AgentMode.PAUSED, AgentMode.REVIEW_REQUIRED), true);

const now = new Date("2026-07-24T12:00:00.000Z");
assert.equal(
  queueSlaState({
    now,
    nextFollowUpAt: new Date("2026-07-24T11:59:00.000Z"),
    lastMessageAt: null,
    status: ConversationStatus.WAITING,
    unreadCount: 0,
  }),
  "OVERDUE",
);
assert.equal(
  queueSlaState({
    now,
    nextFollowUpAt: new Date("2026-07-24T13:00:00.000Z"),
    lastMessageAt: null,
    status: ConversationStatus.WAITING,
    unreadCount: 0,
  }),
  "DUE_SOON",
);
assert.equal(
  queueSlaState({
    now,
    nextFollowUpAt: null,
    lastMessageAt: new Date("2026-07-24T07:00:00.000Z"),
    status: ConversationStatus.OPEN,
    unreadCount: 2,
  }),
  "OVERDUE",
);
assert.equal(
  queueSlaState({
    now,
    nextFollowUpAt: null,
    lastMessageAt: null,
    status: ConversationStatus.CLOSED,
    unreadCount: 0,
  }),
  "NO_DEADLINE",
);

const critical = queuePriorityScore({
  status: ConversationStatus.OPEN,
  agentMode: AgentMode.REVIEW_REQUIRED,
  unreadCount: 4,
  leadTemperature: LeadTemperature.HOT,
  counselorRequested: true,
  assignedToId: null,
  slaState: "OVERDUE",
});
assert.equal(critical, 100);
assert.equal(priorityBand(critical), "CRITICAL");

const low = queuePriorityScore({
  status: ConversationStatus.RESOLVED,
  agentMode: AgentMode.AI,
  unreadCount: 0,
  leadTemperature: LeadTemperature.COLD,
  counselorRequested: false,
  assignedToId: "counselor-1",
  slaState: "NO_DEADLINE",
});
assert.equal(low, 0);
assert.equal(priorityBand(low), "LOW");

console.log("OPERATIONS_SMOKE_PASS=12");
