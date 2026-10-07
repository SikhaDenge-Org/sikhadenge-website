import type { AgentIntent } from "../domain/types";

export type GuardedIntent = {
  intent: AgentIntent;
  reason: string;
};

const RULES: Array<{
  intent: AgentIntent;
  reason: string;
  patterns: RegExp[];
}> = [
  {
    intent: "OPT_OUT",
    reason: "User explicitly requested that messaging stop.",
    patterns: [
      /\b(stop|unsubscribe|opt\s*out)\b/i,
      /message\s*(mat|band)\s*(karo|karna|bhejo)/i,
      /msg\s*(mat|band)\s*(karo|karna|bhejo)/i,
      /promotional\s*message\s*(mat|band)/i,
    ],
  },
  {
    intent: "HUMAN_REQUEST",
    reason: "User explicitly requested a human counselor.",
    patterns: [
      /\b(human|counsel+or|advisor|representative|agent)\b.*\b(call|chat|baat|connect)/i,
      /(sir|mam|maam|team)\s*se\s*baat/i,
      /kisi\s*(insaan|person)\s*se\s*baat/i,
    ],
  },
  {
    intent: "REFUND_OR_COMPLAINT",
    reason: "Refund or complaint language requires human handling.",
    patterns: [
      /\b(refund|complaint|fraud|scam|cheating)\b/i,
      /paise\s*(wapas|return)/i,
      /legal\s*(action|complaint|notice)/i,
    ],
  },
  {
    intent: "PAYMENT_SUPPORT",
    reason: "Payment failure or debit issue requires controlled support.",
    patterns: [
      /payment\s*(fail|failed|pending|stuck)/i,
      /paise\s*(kat|cut|debit)/i,
      /transaction\s*(fail|failed|pending)/i,
    ],
  },
];

export function detectGuardedIntent(text: string): GuardedIntent | null {
  const normalized = text.trim();
  if (!normalized) return null;

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return { intent: rule.intent, reason: rule.reason };
    }
  }

  return null;
}
