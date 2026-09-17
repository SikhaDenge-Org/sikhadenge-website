import { getAgentRuntimePolicy } from "../observability/runtime-policy";
import { retrieveApprovedKnowledge } from "./knowledge";
import { requestModelDecision } from "./openai-responses";
import { generateOwnedReply } from "./owned-reply-engine";
import {
  getAgentPolicy,
  inspectAgentSafety,
  safeHandoffReply,
  trimAgentReply,
} from "./policy";
import { classifyMessage } from "./rule-engine";
import type {
  AgentDecision,
  AgentInput,
  AgentIntent,
  AgentKnowledgeReference,
  AgentLanguage,
  AgentTelemetry,
  HandoffReason,
} from "./types";

const FACTUAL_INTENTS = new Set<AgentIntent>([
  "COURSE_DETAILS",
  "FEES",
  "BATCH_SCHEDULE",
  "DEMO_CLASS",
  "ELIGIBILITY",
  "CERTIFICATE",
  "ENROLLMENT",
]);

function referencesForDecision(references: AgentKnowledgeReference[]) {
  return references.map(({ content: _content, ...reference }) => reference);
}

function useExternalModel(): boolean {
  return process.env.AGENT_REPLY_ENGINE_MODE?.trim().toLowerCase() === "external";
}

function fallbackReply(language: AgentLanguage, intent: AgentIntent): string {
  const english: Record<AgentIntent, string> = {
    GREETING:
      "Hello! Welcome to SikhaDenge. Which course or career goal would you like help with?",
    COURSE_DISCOVERY:
      "I’ll help you choose the right SikhaDenge program. What is your current work or study background, and what do you want to achieve?",
    COURSE_DETAILS:
      "I’m checking the approved course information before sharing details. Which SikhaDenge course are you asking about?",
    FEES:
      "For complete details, please register for the free SikhaDenge demo/masterclass.",
    BATCH_SCHEDULE:
      "Please tell me the course name so I can check the approved batch timing and duration.",
    DEMO_CLASS:
      "I can help with the demo/masterclass registration process. Which course are you interested in?",
    ELIGIBILITY:
      "Please share your current background and the course name so eligibility can be checked accurately.",
    CERTIFICATE:
      "Please tell me the course name so I can confirm its approved certificate details.",
    PAYMENT_SUPPORT:
      "I’m forwarding this payment issue to a SikhaDenge counselor for safe verification.",
    ENROLLMENT:
      "I can guide you through admission using the free demo/masterclass registration process.",
    COUNSELOR_REQUEST:
      "I’m forwarding your request to a SikhaDenge counselor.",
    REFUND_OR_COMPLAINT:
      "I’m forwarding this to the SikhaDenge team for a careful human review.",
    OPT_OUT:
      "Understood. Your opt-out request has been noted and no promotional follow-up should be sent.",
    OUT_OF_SCOPE:
      "I can help with SikhaDenge courses, admissions, batches, demo/masterclasses, certificates, and support.",
    UNKNOWN:
      "Please share a little more detail so I can understand and help correctly.",
  };

  const hinglish: Record<AgentIntent, string> = {
    GREETING:
      "Hello! SikhaDenge mein aapka welcome hai. Aapko kis course ya career goal ke baare mein help chahiye?",
    COURSE_DISCOVERY:
      "Main aapke liye sahi SikhaDenge program choose karne mein help karunga. Aapka current work/study background aur goal kya hai?",
    COURSE_DETAILS:
      "Main approved course information check karke hi details share karunga. Aap kis SikhaDenge course ke baare mein pooch rahe hain?",
    FEES:
      "Complete details ke liye free SikhaDenge demo/masterclass register kijiye.",
    BATCH_SCHEDULE:
      "Approved batch timing aur duration check karne ke liye course ka naam bata dijiye.",
    DEMO_CLASS:
      "Demo/masterclass registration process mein help kar dunga. Aap kis course mein interested hain?",
    ELIGIBILITY:
      "Eligibility accurately check karne ke liye apna background aur course ka naam bata dijiye.",
    CERTIFICATE:
      "Approved certificate details confirm karne ke liye course ka naam bata dijiye.",
    PAYMENT_SUPPORT:
      "Payment issue ko safe verification ke liye SikhaDenge counselor ko handover kar raha hoon.",
    ENROLLMENT:
      "Admission ke liye free demo/masterclass registration process mein guide kar dunga.",
    COUNSELOR_REQUEST:
      "Aapki request SikhaDenge counselor ko handover kar raha hoon.",
    REFUND_OR_COMPLAINT:
      "Is matter ko careful human review ke liye SikhaDenge team ko forward kar raha hoon.",
    OPT_OUT:
      "Samajh gaya. Aapki opt-out request note ho gayi hai aur promotional follow-up nahi bheja jana chahiye.",
    OUT_OF_SCOPE:
      "Main SikhaDenge courses, admission, batches, demo/masterclass, certificate aur support mein help kar sakta hoon.",
    UNKNOWN:
      "Thoda aur detail share kar dijiye, taaki main sahi samajhkar help kar sakun.",
  };

  return language === "en" ? english[intent] : hinglish[intent];
}

function runtimeTelemetry(
  source: AgentTelemetry["source"],
  startedAt: number,
  model?: Omit<AgentTelemetry, "source" | "totalLatencyMs">,
): AgentTelemetry {
  return {
    source,
    totalLatencyMs: Math.max(0, Date.now() - startedAt),
    modelLatencyMs: model?.modelLatencyMs ?? null,
    inputTokens: model?.inputTokens ?? null,
    outputTokens: model?.outputTokens ?? null,
    totalTokens: model?.totalTokens ?? null,
    estimatedCostUsd: model?.estimatedCostUsd ?? null,
    fallbackModelUsed: model?.fallbackModelUsed ?? false,
    requestId: model?.requestId ?? null,
  };
}

function buildDecision(input: {
  reply: string;
  language: AgentLanguage;
  intent: AgentIntent;
  confidence: number;
  decisionSummary: string;
  requiresHuman: boolean;
  handoffReason: HandoffReason | null;
  nextQuestion?: string | null;
  knowledge?: AgentKnowledgeReference[];
  safety: AgentDecision["safety"];
  model?: string | null;
  leadUpdates?: AgentDecision["leadUpdates"];
  telemetry?: AgentTelemetry;
}): AgentDecision {
  return {
    shouldReply: true,
    reply: trimAgentReply(input.reply),
    language: input.language,
    intent: input.intent,
    confidence: Number(Math.min(1, Math.max(0, input.confidence)).toFixed(4)),
    decisionSummary: input.decisionSummary.slice(0, 300),
    requiresHuman: input.requiresHuman,
    handoffReason: input.handoffReason,
    nextQuestion: input.nextQuestion ?? null,
    leadUpdates: input.leadUpdates ?? {},
    knowledgeReferences: referencesForDecision(input.knowledge ?? []),
    safety: input.safety,
    model: input.model ?? null,
    telemetry: input.telemetry,
  };
}

export async function generateAgentDecision(
  input: AgentInput,
): Promise<AgentDecision> {
  const startedAt = Date.now();
  const message = input.customerMessage.trim();
  if (!message) {
    throw new Error("Customer message is required.");
  }

  const policy = getAgentPolicy();
  const runtimePolicy = getAgentRuntimePolicy();
  const classification = classifyMessage(message, input.languageHint);
  const safety = inspectAgentSafety(message);

  if (!runtimePolicy.enabled) {
    return buildDecision({
      reply: safeHandoffReply(classification.language, "general"),
      language: classification.language,
      intent: classification.intent,
      confidence: 1,
      decisionSummary: runtimePolicy.killSwitchActive
        ? "Agent kill switch is active; conversation requires human handling."
        : "Agent runtime is disabled; conversation requires human handling.",
      requiresHuman: true,
      handoffReason: "AGENT_UNAVAILABLE",
      safety,
      telemetry: runtimeTelemetry("fallback", startedAt),
    });
  }

  if (!safety.safe) {
    return buildDecision({
      reply: safeHandoffReply(classification.language, "security"),
      language: classification.language,
      intent: classification.intent,
      confidence: 1,
      decisionSummary:
        "Prompt-injection pattern detected; protected instructions were not exposed.",
      requiresHuman: true,
      handoffReason: "PROMPT_INJECTION",
      safety,
      telemetry: runtimeTelemetry("rule", startedAt),
    });
  }

  if (classification.intent === "OPT_OUT") {
    return buildDecision({
      reply: fallbackReply(classification.language, "OPT_OUT"),
      language: classification.language,
      intent: "OPT_OUT",
      confidence: classification.confidence,
      decisionSummary: "Customer requested messaging opt-out.",
      requiresHuman: false,
      handoffReason: null,
      safety,
      telemetry: runtimeTelemetry("rule", startedAt),
    });
  }

  if (classification.requiresHuman) {
    const reason =
      classification.intent === "PAYMENT_SUPPORT"
        ? "payment"
        : classification.intent === "REFUND_OR_COMPLAINT"
          ? "complaint"
          : "general";

    return buildDecision({
      reply: safeHandoffReply(classification.language, reason),
      language: classification.language,
      intent: classification.intent,
      confidence: classification.confidence,
      decisionSummary: "Rule-based policy requires counselor handoff.",
      requiresHuman: true,
      handoffReason: classification.handoffReason,
      safety,
      leadUpdates:
        classification.intent === "COUNSELOR_REQUEST"
          ? { counselorRequested: true }
          : {},
      telemetry: runtimeTelemetry("rule", startedAt),
    });
  }

  const knowledge = await retrieveApprovedKnowledge(message);

  if (!useExternalModel() || classification.intent === "FEES") {
    const owned = generateOwnedReply({
      agentInput: input,
      classification,
      knowledge,
    });

    return buildDecision({
      reply: owned.reply,
      language: classification.language,
      intent: classification.intent,
      confidence: owned.confidence,
      decisionSummary: owned.decisionSummary,
      requiresHuman: owned.requiresHuman,
      handoffReason: owned.handoffReason,
      nextQuestion: owned.nextQuestion,
      leadUpdates: owned.leadUpdates,
      knowledge,
      safety,
      model: "sikhadenge-owned-v1",
      telemetry: runtimeTelemetry("rule", startedAt),
    });
  }

  const factualIntent = FACTUAL_INTENTS.has(classification.intent);

  if (factualIntent && knowledge.length === 0) {
    return buildDecision({
      reply: safeHandoffReply(classification.language, "knowledge"),
      language: classification.language,
      intent: classification.intent,
      confidence: Math.min(classification.confidence, 0.62),
      decisionSummary:
        "No relevant approved knowledge was available for a factual answer.",
      requiresHuman: true,
      handoffReason: "MISSING_APPROVED_KNOWLEDGE",
      safety,
      telemetry: runtimeTelemetry("rule", startedAt),
    });
  }

  try {
    const modelResult = await requestModelDecision({
      agentInput: {
        ...input,
        history: (input.history ?? []).slice(-policy.maximumHistoryMessages),
      },
      classification,
      knowledge,
    });
    if (!modelResult) {
      return buildDecision({
        reply: fallbackReply(classification.language, classification.intent),
        language: classification.language,
        intent: classification.intent,
        confidence: Math.min(classification.confidence, 0.7),
        decisionSummary:
          "External model calls are unavailable; safe deterministic fallback used.",
        requiresHuman: factualIntent,
        handoffReason: factualIntent ? "AGENT_UNAVAILABLE" : null,
        knowledge,
        safety,
        telemetry: runtimeTelemetry("fallback", startedAt),
      });
    }

    const modelDecision = modelResult.decision;
    const combinedConfidence = Math.min(
      1,
      modelDecision.confidence * 0.72 + classification.confidence * 0.28,
    );
    const requiresHuman =
      modelDecision.requiresHuman ||
      combinedConfidence < policy.autoReplyConfidence;
    const handoffReason = requiresHuman
      ? modelDecision.handoffReason ?? "LOW_CONFIDENCE"
      : null;

    return buildDecision({
      reply: modelDecision.reply,
      language: classification.language,
      intent: modelDecision.intent,
      confidence: combinedConfidence,
      decisionSummary: modelDecision.decisionSummary,
      requiresHuman,
      handoffReason,
      nextQuestion: modelDecision.nextQuestion,
      leadUpdates: modelDecision.leadUpdates,
      knowledge,
      safety,
      model: modelResult.model,
      telemetry: runtimeTelemetry("model", startedAt, modelResult.telemetry),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown model error.";
    return buildDecision({
      reply: safeHandoffReply(classification.language, "general"),
      language: classification.language,
      intent: classification.intent,
      confidence: Math.min(classification.confidence, 0.5),
      decisionSummary: `Agent model failed safely: ${detail}`,
      requiresHuman: true,
      handoffReason: "AGENT_UNAVAILABLE",
      knowledge,
      safety,
      telemetry: runtimeTelemetry("fallback", startedAt),
    });
  }
}
