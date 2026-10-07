import type {
  AgentAction,
  AgentDecision,
  AgentDecisionInput,
} from "../domain/types";
import { getRiskLevel, validateDecision } from "./decision-policy";
import { detectGuardedIntent } from "./intent-guard";

export type AgentRunStatus =
  | "AUTO_EXECUTED"
  | "WAITING_FOR_REVIEW"
  | "SKIPPED_HUMAN_MODE"
  | "FAILED_SAFE";

export interface AgentContextLoader {
  load(input: {
    conversationId: string;
    messageId: string;
    inboundText: string;
  }): Promise<AgentDecisionInput>;
}

export interface AgentReasoningProvider {
  decide(input: AgentDecisionInput): Promise<AgentDecision>;
}

export interface AgentDecisionStore {
  save(input: {
    conversationId: string;
    messageId: string;
    decision: AgentDecision;
  }): Promise<void>;
}

export interface AgentActionExecutor {
  execute(input: {
    conversationId: string;
    messageId: string;
    action: AgentAction;
    decision: AgentDecision;
  }): Promise<void>;
}

export interface AgentReviewQueue {
  enqueue(input: {
    conversationId: string;
    messageId: string;
    decision: AgentDecision;
  }): Promise<void>;
}

export interface AgentErrorReporter {
  capture(input: {
    conversationId: string;
    messageId: string;
    error: unknown;
  }): Promise<void>;
}

export interface AgentRuntimeDependencies {
  contextLoader: AgentContextLoader;
  reasoner: AgentReasoningProvider;
  decisionStore: AgentDecisionStore;
  actionExecutor: AgentActionExecutor;
  reviewQueue: AgentReviewQueue;
  errorReporter: AgentErrorReporter;
}

export type AgentRunResult = {
  status: AgentRunStatus;
  decision?: AgentDecision;
};

const SAFETY_ACTIONS = new Set<AgentAction["type"]>([
  "PAUSE_AI",
  "ASSIGN_COUNSELOR",
  "MARK_OPT_OUT",
]);

async function executeActions(
  dependencies: AgentRuntimeDependencies,
  input: {
    conversationId: string;
    messageId: string;
    decision: AgentDecision;
    safetyOnly: boolean;
  },
): Promise<void> {
  for (const action of input.decision.actions) {
    if (input.safetyOnly && !SAFETY_ACTIONS.has(action.type)) continue;

    await dependencies.actionExecutor.execute({
      conversationId: input.conversationId,
      messageId: input.messageId,
      action,
      decision: input.decision,
    });
  }
}

function applyDeterministicGuard(
  inboundText: string,
  decision: AgentDecision,
): AgentDecision {
  const guarded = detectGuardedIntent(inboundText);
  if (!guarded) return decision;

  return {
    ...decision,
    intent: guarded.intent,
    risk: getRiskLevel(guarded.intent),
    conciseDecisionSummary: guarded.reason,
  };
}

function createSafeFailureDecision(reason: string): AgentDecision {
  return {
    intent: "UNSUPPORTED",
    language: "unknown",
    risk: "HIGH",
    confidence: 0,
    conciseDecisionSummary: "Agent processing failed; no reply was generated.",
    knowledgeReferences: [],
    actions: [{ type: "PAUSE_AI" }, { type: "ASSIGN_COUNSELOR" }],
    requiresHumanReview: true,
    reviewReason: reason,
  };
}

export async function runAgentTurn(
  dependencies: AgentRuntimeDependencies,
  request: {
    conversationId: string;
    messageId: string;
    inboundText: string;
  },
): Promise<AgentRunResult> {
  try {
    const context = await dependencies.contextLoader.load(request);

    if (context.conversation.mode !== "AI") {
      return { status: "SKIPPED_HUMAN_MODE" };
    }

    const modelDecision = await dependencies.reasoner.decide(context);
    const guardedDecision = applyDeterministicGuard(request.inboundText, modelDecision);
    const decision = validateDecision(context, guardedDecision);

    // Store only concise operational reasoning, never hidden chain-of-thought.
    await dependencies.decisionStore.save({
      conversationId: request.conversationId,
      messageId: request.messageId,
      decision,
    });

    if (decision.requiresHumanReview) {
      await executeActions(dependencies, {
        ...request,
        decision,
        safetyOnly: true,
      });
      await dependencies.reviewQueue.enqueue({
        conversationId: request.conversationId,
        messageId: request.messageId,
        decision,
      });
      return { status: "WAITING_FOR_REVIEW", decision };
    }

    await executeActions(dependencies, {
      ...request,
      decision,
      safetyOnly: false,
    });

    return { status: "AUTO_EXECUTED", decision };
  } catch (error) {
    const failureDecision = createSafeFailureDecision(
      "An internal agent error requires counselor review.",
    );

    await dependencies.errorReporter.capture({
      conversationId: request.conversationId,
      messageId: request.messageId,
      error,
    });

    try {
      await dependencies.decisionStore.save({
        conversationId: request.conversationId,
        messageId: request.messageId,
        decision: failureDecision,
      });
      await executeActions(dependencies, {
        ...request,
        decision: failureDecision,
        safetyOnly: true,
      });
      await dependencies.reviewQueue.enqueue({
        conversationId: request.conversationId,
        messageId: request.messageId,
        decision: failureDecision,
      });
    } catch {
      // The original failure remains authoritative; no automatic message is sent.
    }

    return { status: "FAILED_SAFE", decision: failureDecision };
  }
}
