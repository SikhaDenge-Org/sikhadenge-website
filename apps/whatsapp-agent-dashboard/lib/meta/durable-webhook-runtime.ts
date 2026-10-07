import { createHash, randomUUID } from "node:crypto";

import { processWebhookAgentBridge } from "@/lib/agent/webhook-agent-bridge";
import {
  processWhatsAppInboundViaCore,
} from "@/modules/channels/whatsapp/application/whatsapp-channel-adapter";
import {
  ingestDurableEvent,
  PermanentEventError,
  RetryableEventError,
  type DurableEventStore,
  type EventProcessor,
  type EventQueue,
} from "@/modules/events/application/event-runtime";

type Environment = Readonly<Record<string, string | undefined>>;

export function engageOsEventRuntimeEnabled(env: Environment = process.env): boolean {
  return env.ENGAGEOS_EVENT_RUNTIME_ENABLED?.trim().toLowerCase() === "true";
}

export function assertEventRuntimeConfiguration(env: Environment = process.env): void {
  if (!engageOsEventRuntimeEnabled(env)) return;
  if (!env.REDIS_URL?.trim()) {
    throw new Error("REDIS_URL is required when ENGAGEOS_EVENT_RUNTIME_ENABLED=true.");
  }
  if (!env.WHATSAPP_PHONE_NUMBER_ID?.trim() && !env.META_WHATSAPP_PHONE_NUMBER_ID?.trim()) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is required for durable WhatsApp event routing.");
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function durableWhatsAppEventInput(input: {
  payload: unknown;
  rawBody: string;
  env?: Environment;
  receivedAt?: Date;
}) {
  const env = input.env ?? process.env;
  const receivedAt = input.receivedAt ?? new Date();
  const digest = sha256(input.rawBody);
  const phoneNumberId =
    env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    "unconfigured";

  return {
    id: randomUUID(),
    eventKey: `meta:whatsapp:${digest}`,
    workspaceId: "sikhadenge-default",
    connectionId: `whatsapp:${phoneNumberId}`,
    channel: "WHATSAPP",
    eventType: "META_WHATSAPP_WEBHOOK",
    payload: {
      providerPayload: input.payload,
      rawBody: input.rawBody,
      payloadDigest: digest,
    } as Readonly<Record<string, unknown>>,
    occurredAt: receivedAt,
    receivedAt,
  };
}

export async function enqueueWhatsAppWebhookDurably(input: {
  payload: unknown;
  rawBody: string;
  store: DurableEventStore;
  queue: EventQueue;
  env?: Environment;
  now?: Date;
}) {
  const event = durableWhatsAppEventInput({
    payload: input.payload,
    rawBody: input.rawBody,
    env: input.env,
    receivedAt: input.now,
  });
  return ingestDurableEvent({
    event,
    correlationId: randomUUID(),
    store: input.store,
    queue: input.queue,
    now: input.now,
  });
}

export const processDurableWhatsAppEvent: EventProcessor = async (event) => {
  if (event.eventType !== "META_WHATSAPP_WEBHOOK") {
    throw new PermanentEventError(`Unsupported durable event type: ${event.eventType}`);
  }

  const rawBody = event.payload.rawBody;
  const providerPayload = event.payload.providerPayload;
  if (typeof rawBody !== "string" || !rawBody) {
    throw new PermanentEventError("Durable WhatsApp event rawBody is missing.");
  }
  if (!providerPayload || typeof providerPayload !== "object") {
    throw new PermanentEventError("Durable WhatsApp provider payload is missing.");
  }

  try {
    await processWhatsAppInboundViaCore(providerPayload, rawBody);
    await processWebhookAgentBridge(providerPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new RetryableEventError(message);
  }
};
