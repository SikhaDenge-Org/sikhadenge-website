export type WhatsAppOutboundRequest = {
  kind: "TEXT" | "MEDIA" | "TEMPLATE";
  now: Date;
  lastCustomerMessageAt?: Date;
  serviceWindowMs: number;
  approvedTemplateAvailable: boolean;
  capabilityEnabled: boolean;
  outboundPaused: boolean;
};

export type WhatsAppOutboundDecision =
  | { allowed: true; mode: "SESSION" | "TEMPLATE" }
  | { allowed: false; reason: string };

export function evaluateWhatsAppOutbound(
  request: WhatsAppOutboundRequest,
): WhatsAppOutboundDecision {
  if (request.outboundPaused) return { allowed: false, reason: "Outbound is paused." };
  if (!request.capabilityEnabled) {
    return { allowed: false, reason: "Requested outbound capability is not verified." };
  }
  if (!Number.isFinite(request.serviceWindowMs) || request.serviceWindowMs <= 0) {
    return { allowed: false, reason: "Service-window configuration is invalid." };
  }

  if (request.kind === "TEMPLATE") {
    return request.approvedTemplateAvailable
      ? { allowed: true, mode: "TEMPLATE" }
      : { allowed: false, reason: "No approved template is available." };
  }

  const lastCustomerMessageAt = request.lastCustomerMessageAt;
  const insideWindow = Boolean(
    lastCustomerMessageAt &&
      request.now.getTime() >= lastCustomerMessageAt.getTime() &&
      request.now.getTime() - lastCustomerMessageAt.getTime() <= request.serviceWindowMs,
  );

  if (insideWindow) return { allowed: true, mode: "SESSION" };
  return request.approvedTemplateAvailable
    ? { allowed: true, mode: "TEMPLATE" }
    : { allowed: false, reason: "Session window is closed and no approved template is available." };
}
