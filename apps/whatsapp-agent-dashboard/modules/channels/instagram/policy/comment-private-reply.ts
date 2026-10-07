export type InstagramCommentAutomationInput = {
  commentId: string;
  commentCreatedAt: Date;
  now: Date;
  privateReplyWindowMs: number;
  matchedRule: boolean;
  complaintOrSensitive: boolean;
  suppressed: boolean;
  publicReplySupported: boolean;
  privateReplySupported: boolean;
  initialPrivateReplyAlreadySent: boolean;
};

export type InstagramCommentAutomationDecision = {
  actions: readonly ("PUBLIC_REPLY" | "PRIVATE_REPLY" | "HUMAN_REVIEW")[];
  reason?: string;
};

export function evaluateInstagramCommentAutomation(
  input: InstagramCommentAutomationInput,
): InstagramCommentAutomationDecision {
  if (!input.commentId.trim()) return { actions: [], reason: "Missing comment identity." };
  if (input.suppressed) return { actions: [], reason: "Customer is suppressed." };
  if (!input.matchedRule) return { actions: [], reason: "No automation rule matched." };
  if (input.complaintOrSensitive) return { actions: ["HUMAN_REVIEW"] };
  if (!Number.isFinite(input.privateReplyWindowMs) || input.privateReplyWindowMs <= 0) {
    return { actions: ["HUMAN_REVIEW"], reason: "Private-reply policy window is not configured." };
  }

  const elapsed = input.now.getTime() - input.commentCreatedAt.getTime();
  const privateReplyAllowed =
    input.privateReplySupported &&
    !input.initialPrivateReplyAlreadySent &&
    elapsed >= 0 &&
    elapsed <= input.privateReplyWindowMs;

  const actions: ("PUBLIC_REPLY" | "PRIVATE_REPLY")[] = [];
  if (input.publicReplySupported) actions.push("PUBLIC_REPLY");
  if (privateReplyAllowed) actions.push("PRIVATE_REPLY");
  return actions.length ? { actions } : { actions: [], reason: "No verified action is currently allowed." };
}
