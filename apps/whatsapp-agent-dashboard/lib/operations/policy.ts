import {
  AgentMode,
  ConversationStatus,
  LeadTemperature,
} from "@prisma/client";

export type QueueSlaState = "OVERDUE" | "DUE_SOON" | "ON_TRACK" | "NO_DEADLINE";

const STATUS_TRANSITIONS: Record<ConversationStatus, ReadonlySet<ConversationStatus>> = {
  [ConversationStatus.OPEN]: new Set([
    ConversationStatus.OPEN,
    ConversationStatus.WAITING,
    ConversationStatus.RESOLVED,
    ConversationStatus.CLOSED,
    ConversationStatus.SPAM,
  ]),
  [ConversationStatus.WAITING]: new Set([
    ConversationStatus.WAITING,
    ConversationStatus.OPEN,
    ConversationStatus.RESOLVED,
    ConversationStatus.CLOSED,
    ConversationStatus.SPAM,
  ]),
  [ConversationStatus.RESOLVED]: new Set([
    ConversationStatus.RESOLVED,
    ConversationStatus.OPEN,
    ConversationStatus.CLOSED,
  ]),
  [ConversationStatus.CLOSED]: new Set([
    ConversationStatus.CLOSED,
    ConversationStatus.OPEN,
  ]),
  [ConversationStatus.SPAM]: new Set([
    ConversationStatus.SPAM,
    ConversationStatus.OPEN,
  ]),
};

const MODE_TRANSITIONS: Record<AgentMode, ReadonlySet<AgentMode>> = {
  [AgentMode.AI]: new Set([
    AgentMode.AI,
    AgentMode.HUMAN,
    AgentMode.REVIEW_REQUIRED,
    AgentMode.PAUSED,
  ]),
  [AgentMode.HUMAN]: new Set([
    AgentMode.HUMAN,
    AgentMode.AI,
    AgentMode.REVIEW_REQUIRED,
    AgentMode.PAUSED,
  ]),
  [AgentMode.REVIEW_REQUIRED]: new Set([
    AgentMode.REVIEW_REQUIRED,
    AgentMode.HUMAN,
    AgentMode.AI,
    AgentMode.PAUSED,
  ]),
  [AgentMode.PAUSED]: new Set([
    AgentMode.PAUSED,
    AgentMode.AI,
    AgentMode.HUMAN,
    AgentMode.REVIEW_REQUIRED,
  ]),
};

export function canTransitionConversationStatus(
  current: ConversationStatus,
  next: ConversationStatus,
): boolean {
  return STATUS_TRANSITIONS[current].has(next);
}

export function canTransitionAgentMode(current: AgentMode, next: AgentMode): boolean {
  return MODE_TRANSITIONS[current].has(next);
}

export function validateConversationStatusTransition(
  current: ConversationStatus,
  next: ConversationStatus,
): void {
  if (!canTransitionConversationStatus(current, next)) {
    throw new Error(`Conversation status cannot move from ${current} to ${next}.`);
  }
}

export function validateAgentModeTransition(current: AgentMode, next: AgentMode): void {
  if (!canTransitionAgentMode(current, next)) {
    throw new Error(`Agent mode cannot move from ${current} to ${next}.`);
  }
}

export function queueSlaState(input: {
  now: Date;
  nextFollowUpAt: Date | null;
  lastMessageAt: Date | null;
  status: ConversationStatus;
  unreadCount: number;
}): QueueSlaState {
  if (
    input.status === ConversationStatus.CLOSED ||
    input.status === ConversationStatus.SPAM
  ) {
    return "NO_DEADLINE";
  }

  const deadline = input.nextFollowUpAt;
  if (deadline) {
    const remainingMs = deadline.getTime() - input.now.getTime();
    if (remainingMs < 0) return "OVERDUE";
    if (remainingMs <= 2 * 60 * 60 * 1_000) return "DUE_SOON";
    return "ON_TRACK";
  }

  if (input.unreadCount > 0 && input.lastMessageAt) {
    const ageMs = input.now.getTime() - input.lastMessageAt.getTime();
    if (ageMs >= 4 * 60 * 60 * 1_000) return "OVERDUE";
    if (ageMs >= 90 * 60 * 1_000) return "DUE_SOON";
    return "ON_TRACK";
  }

  return "NO_DEADLINE";
}

export function queuePriorityScore(input: {
  status: ConversationStatus;
  agentMode: AgentMode;
  unreadCount: number;
  leadTemperature: LeadTemperature | null;
  counselorRequested: boolean;
  assignedToId: string | null;
  slaState: QueueSlaState;
}): number {
  if (input.status === ConversationStatus.SPAM) return 0;

  let score = 0;
  if (input.slaState === "OVERDUE") score += 45;
  else if (input.slaState === "DUE_SOON") score += 25;
  else if (input.slaState === "ON_TRACK") score += 8;

  score += Math.min(20, Math.max(0, input.unreadCount) * 4);
  if (input.agentMode === AgentMode.REVIEW_REQUIRED) score += 22;
  if (input.agentMode === AgentMode.HUMAN) score += 8;
  if (input.counselorRequested) score += 18;
  if (!input.assignedToId) score += 12;

  if (input.leadTemperature === LeadTemperature.HOT) score += 20;
  else if (input.leadTemperature === LeadTemperature.WARM) score += 10;

  if (input.status === ConversationStatus.RESOLVED) score = Math.max(0, score - 20);
  if (input.status === ConversationStatus.CLOSED) score = 0;
  return Math.min(100, score);
}

export function priorityBand(score: number): "CRITICAL" | "HIGH" | "NORMAL" | "LOW" {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 20) return "NORMAL";
  return "LOW";
}
