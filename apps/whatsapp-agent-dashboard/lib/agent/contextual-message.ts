import type { AgentHistoryMessage } from "./types";

const RECENT_CONTEXT_WINDOW = 12;
const CANONICAL_DEMO_LINK_QUESTION =
  "Main Free Demo Class ka link share kar doon?";

const DEMO_LINK_QUESTION =
  /(?:main\s+(?:free\s+)?demo\s+(?:class\s+)?ka\s+link\s+share\s+kar\s+doon|main\s+link\s+share\s+kar\s+doon|demo\s+(?:class\s+)?ka\s+link\s+(?:share|bhej)|link\s+(?:share|bhej)\s+kar\s+doon)/iu;

const DEMO_LINK_CONFIRMATION =
  /^\s*(?:(?:yes|haan|ha|ji|bilkul|sure|ok|okay)(?:\s+(?:please|link|demo\s+link|link\s+(?:bhej|share)(?:\s+do)?))?|(?:link|demo\s+link)\s+(?:bhej|share)(?:\s+do)?|send\s+(?:the\s+)?link)\s*[.!😊🙏]*\s*$/iu;

export function findRecentDemoLinkQuestion(
  history?: AgentHistoryMessage[] | null,
): AgentHistoryMessage | null {
  return (
    (history ?? [])
      .slice(-RECENT_CONTEXT_WINDOW)
      .reverse()
      .find(
        (item) => item.role === "assistant" && DEMO_LINK_QUESTION.test(item.text),
      ) ?? null
  );
}

export function normalizeContextualCustomerMessage(input: {
  customerMessage: string;
  history?: AgentHistoryMessage[] | null;
}): string {
  const message = input.customerMessage.trim();
  if (!message) return input.customerMessage;

  if (
    findRecentDemoLinkQuestion(input.history) &&
    DEMO_LINK_CONFIRMATION.test(message)
  ) {
    return "yes";
  }

  return input.customerMessage;
}

export function contextualizeAgentConversation(input: {
  customerMessage: string;
  history?: AgentHistoryMessage[] | null;
}): {
  customerMessage: string;
  history: AgentHistoryMessage[];
} {
  const history = [...(input.history ?? [])];
  const customerMessage = normalizeContextualCustomerMessage(input);
  if (customerMessage === input.customerMessage) {
    return { customerMessage, history };
  }

  const demoQuestion = findRecentDemoLinkQuestion(history);
  if (!demoQuestion) return { customerMessage, history };

  let currentCustomerIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (
      item?.role === "customer" &&
      item.text.trim() === input.customerMessage.trim()
    ) {
      currentCustomerIndex = index;
      break;
    }
  }

  const currentCustomer =
    currentCustomerIndex >= 0 ? history[currentCustomerIndex] ?? null : null;
  const withoutCurrent = history.filter(
    (_item, index) => index !== currentCustomerIndex,
  );
  const demoQuestionIndex = withoutCurrent.lastIndexOf(demoQuestion);
  const withoutRecoveredQuestion = withoutCurrent.filter(
    (_item, index) => index !== demoQuestionIndex,
  );
  const recoveredDemoQuestion: AgentHistoryMessage = {
    ...demoQuestion,
    text: CANONICAL_DEMO_LINK_QUESTION,
  };

  return {
    customerMessage,
    history: [
      ...withoutRecoveredQuestion,
      recoveredDemoQuestion,
      ...(currentCustomer ? [currentCustomer] : []),
    ],
  };
}
