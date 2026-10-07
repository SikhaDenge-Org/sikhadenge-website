export type MessengerResponseWindowInput = {
  now: Date;
  lastCustomerMessageAt?: Date | null;
  responseWindowMs?: number;
  pageIsolationVerified: boolean;
  messagingCapabilityVerified: boolean;
  outboundPaused: boolean;
};

export type MessengerResponseWindowDecision =
  | { allowed: true; reason: null }
  | { allowed: false; reason: string };

const DEFAULT_RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1_000;

export function evaluateMessengerResponseWindow(
  input: MessengerResponseWindowInput,
): MessengerResponseWindowDecision {
  if (!input.pageIsolationVerified) {
    return { allowed: false, reason: "Messenger Page isolation is not verified." };
  }
  if (!input.messagingCapabilityVerified) {
    return { allowed: false, reason: "Messenger messaging capability is not verified." };
  }
  if (input.outboundPaused) {
    return { allowed: false, reason: "Messenger outbound is paused." };
  }

  const windowMs = input.responseWindowMs ?? DEFAULT_RESPONSE_WINDOW_MS;
  if (!Number.isFinite(windowMs) || windowMs <= 0 || windowMs > DEFAULT_RESPONSE_WINDOW_MS) {
    return { allowed: false, reason: "Messenger response-window configuration is invalid." };
  }

  const lastCustomerMessageAt = input.lastCustomerMessageAt;
  if (!lastCustomerMessageAt) {
    return { allowed: false, reason: "No customer message exists to open the Messenger response window." };
  }

  const elapsed = input.now.getTime() - lastCustomerMessageAt.getTime();
  if (elapsed < 0 || elapsed > windowMs) {
    return { allowed: false, reason: "Messenger 24-hour response window is closed." };
  }
  return { allowed: true, reason: null };
}
