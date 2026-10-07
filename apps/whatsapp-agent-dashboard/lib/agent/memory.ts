import type { AgentDecision, AgentInput } from "./types";

const SECRET_PATTERNS = [
  /\b(?:otp|one[ -]?time password|cvv|upi pin|atm pin|password|access token)\b[^\n]*/gi,
  /\b(?:\d[ -]*?){13,19}\b/g,
  /\b\d{12}\b/g,
];

function redact(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted.trim().replace(/\s+/g, " ");
}

function addFact(facts: string[], label: string, value: unknown): void {
  if (typeof value === "string" && value.trim()) {
    facts.push(`${label}: ${redact(value).slice(0, 220)}`);
  } else if (typeof value === "boolean") {
    facts.push(`${label}: ${value ? "yes" : "no"}`);
  } else if (typeof value === "number" && Number.isFinite(value)) {
    facts.push(`${label}: ${value}`);
  }
}

export function buildConversationMemory(input: {
  agentInput: AgentInput;
  decision: AgentDecision;
  previousSummary?: string | null;
}): string {
  const facts: string[] = [];
  const contact = input.agentInput.contact;
  const lead = input.agentInput.lead;

  addFact(facts, "Customer", contact?.name);
  addFact(facts, "City", contact?.city);
  addFact(facts, "Language", input.decision.language);
  addFact(facts, "Current intent", input.decision.intent);
  addFact(facts, "Lead stage", lead?.stage);
  addFact(facts, "Lead temperature", lead?.temperature);
  addFact(facts, "Course interest", lead?.interestedCourse);
  addFact(facts, "Goal", lead?.goal);
  addFact(facts, "Occupation", lead?.occupation);
  addFact(facts, "Experience", lead?.experienceLevel);
  addFact(facts, "Joining timeline", lead?.joiningTimeline);
  addFact(facts, "Class availability", lead?.classAvailability);
  addFact(facts, "Fee understood", lead?.feeUnderstood);
  addFact(facts, "Counselor requested", lead?.counselorRequested);
  addFact(
    facts,
    "Latest customer request",
    redact(input.agentInput.customerMessage).slice(0, 320),
  );
  addFact(facts, "Agent decision", input.decision.decisionSummary);

  const prior = input.previousSummary ? redact(input.previousSummary).slice(0, 700) : "";
  const current = Array.from(new Set(facts)).join(" | ");
  const summary = prior ? `${prior} || ${current}` : current;
  return summary.slice(-1_500);
}

export function redactMemoryText(value: string): string {
  return redact(value).slice(0, 1_500);
}
