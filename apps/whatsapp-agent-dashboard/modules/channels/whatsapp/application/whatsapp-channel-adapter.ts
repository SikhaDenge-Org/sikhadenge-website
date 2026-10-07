import { processWhatsAppWebhook, type WebhookProcessingResult } from "@/lib/meta/webhook-processor";
import { normalizeWhatsAppWebhook } from "@/lib/meta/webhook-normalizer";
import {
  dispatchOutboundMessage,
  queueOutboundMessage,
} from "@/lib/outbound/outbound-service";
import type {
  DispatchResult,
  QueueOutboundInput,
} from "@/lib/outbound/types";

export type WhatsAppCoreMode = "legacy" | "shadow" | "normalized";

type Environment = Readonly<Record<string, string | undefined>>;

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function whatsAppCoreMode(
  env: Environment = process.env,
): WhatsAppCoreMode {
  const value = env.ENGAGEOS_WHATSAPP_CORE_MODE?.trim().toLowerCase();
  if (value === "shadow" || value === "normalized") return value;
  return "legacy";
}

export function assertWhatsAppCoreConfiguration(
  env: Environment = process.env,
): void {
  if (whatsAppCoreMode(env) !== "normalized") return;

  if (!enabled(env.ENGAGEOS_EVENT_RUNTIME_ENABLED)) {
    throw new Error(
      "ENGAGEOS_EVENT_RUNTIME_ENABLED=true is required for normalized WhatsApp core mode.",
    );
  }
  if (!enabled(env.ENGAGEOS_EVENT_WORKER_ENABLED)) {
    throw new Error(
      "ENGAGEOS_EVENT_WORKER_ENABLED=true is required for normalized WhatsApp core mode.",
    );
  }
  if (!enabled(env.ENGAGEOS_WHATSAPP_BACKFILL_COMPLETE)) {
    throw new Error(
      "ENGAGEOS_WHATSAPP_BACKFILL_COMPLETE=true is required for normalized WhatsApp core mode.",
    );
  }
  if (
    !env.WHATSAPP_PHONE_NUMBER_ID?.trim() &&
    !env.META_WHATSAPP_PHONE_NUMBER_ID?.trim()
  ) {
    throw new Error(
      "WHATSAPP_PHONE_NUMBER_ID is required for normalized WhatsApp core mode.",
    );
  }
}

export function normalizeWhatsAppInboundForCore(payload: unknown) {
  return normalizeWhatsAppWebhook(payload);
}

export async function processWhatsAppInboundViaCore(
  payload: unknown,
  rawBody: string,
  env: Environment = process.env,
): Promise<WebhookProcessingResult> {
  const mode = whatsAppCoreMode(env);
  assertWhatsAppCoreConfiguration(env);

  if (mode !== "legacy") {
    // Shadow/normalized modes validate the channel-neutral event projection before
    // delegating to the battle-tested compatibility persistence path.
    normalizeWhatsAppInboundForCore(payload);
  }

  return processWhatsAppWebhook(payload, rawBody);
}

export async function queueWhatsAppOutboundViaCore(
  input: QueueOutboundInput,
  env: Environment = process.env,
) {
  assertWhatsAppCoreConfiguration(env);
  return queueOutboundMessage(input);
}

export async function dispatchWhatsAppOutboundViaCore(
  messageId: string,
  env: Environment = process.env,
): Promise<DispatchResult> {
  assertWhatsAppCoreConfiguration(env);
  return dispatchOutboundMessage(messageId);
}

export type NormalizedWhatsAppDeliveryStatus =
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "UNKNOWN";

export function mapWhatsAppDeliveryStatus(
  providerStatus: string,
): NormalizedWhatsAppDeliveryStatus {
  switch (providerStatus.trim().toLowerCase()) {
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "read":
      return "READ";
    case "failed":
      return "FAILED";
    default:
      return "UNKNOWN";
  }
}

export function normalizedWhatsAppConversationRef(legacyConversationId: string): string {
  const id = legacyConversationId.trim();
  if (!id) throw new Error("Legacy conversation ID is required.");
  // Preserve IDs during Phase 6 so historical links, assignments and lead relations
  // remain valid and rollback never requires an ID translation table.
  return id;
}
