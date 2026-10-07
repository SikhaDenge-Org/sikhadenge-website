import assert from "node:assert/strict";

import {
  assertEventRuntimeConfiguration,
  durableWhatsAppEventInput,
  engageOsEventRuntimeEnabled,
  enqueueWhatsAppWebhookDurably,
} from "../lib/meta/durable-webhook-runtime";
import type {
  DurableEventInput,
  DurableEventStore,
  EventJob,
  EventQueue,
  StoredDurableEvent,
} from "../modules/events/application/event-runtime";

class MemoryStore implements DurableEventStore {
  readonly rows = new Map<string, StoredDurableEvent>();
  async reserve(event: DurableEventInput, correlationId: string) {
    const existing = [...this.rows.values()].find((row) => row.eventKey === event.eventKey);
    if (existing) return { created: false, event: existing };
    const stored: StoredDurableEvent = { ...event, state: "RECEIVED", attempts: 0, correlationId };
    this.rows.set(event.id, stored);
    return { created: true, event: stored };
  }
  async getById(id: string) { return this.rows.get(id) ?? null; }
  async markQueued(id: string) { this.rows.get(id)!.state = "QUEUED"; }
  async markProcessing() {}
  async markRetry() {}
  async markProcessed() {}
  async markDeadLetter() {}
}

class MemoryQueue implements EventQueue {
  readonly jobs: EventJob[] = [];
  async enqueue(job: EventJob) { this.jobs.push(job); }
  async dequeueDue() { return this.jobs.shift() ?? null; }
}

async function main() {
  assert.equal(engageOsEventRuntimeEnabled({}), false);
  assert.equal(engageOsEventRuntimeEnabled({ ENGAGEOS_EVENT_RUNTIME_ENABLED: "true" }), true);
  assert.throws(
    () => assertEventRuntimeConfiguration({ ENGAGEOS_EVENT_RUNTIME_ENABLED: "true" }),
    /REDIS_URL/,
  );
  assert.doesNotThrow(() =>
    assertEventRuntimeConfiguration({
      ENGAGEOS_EVENT_RUNTIME_ENABLED: "true",
      REDIS_URL: "redis://127.0.0.1:6379",
      WHATSAPP_PHONE_NUMBER_ID: "12345",
    }),
  );

  const env = { WHATSAPP_PHONE_NUMBER_ID: "12345" };
  const first = durableWhatsAppEventInput({ payload: { object: "whatsapp_business_account" }, rawBody: "{\"x\":1}", env });
  const second = durableWhatsAppEventInput({ payload: { object: "whatsapp_business_account" }, rawBody: "{\"x\":1}", env });
  assert.equal(first.eventKey, second.eventKey);
  assert.equal(first.connectionId, "whatsapp:12345");
  assert.equal(first.eventType, "META_WHATSAPP_WEBHOOK");

  const store = new MemoryStore();
  const queue = new MemoryQueue();
  const accepted = await enqueueWhatsAppWebhookDurably({
    payload: { object: "whatsapp_business_account" },
    rawBody: "{\"x\":1}",
    store,
    queue,
    env,
    now: new Date("2026-09-09T14:30:00Z"),
  });
  const duplicate = await enqueueWhatsAppWebhookDurably({
    payload: { object: "whatsapp_business_account" },
    rawBody: "{\"x\":1}",
    store,
    queue,
    env,
    now: new Date("2026-09-09T14:30:01Z"),
  });
  assert.equal(accepted.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(queue.jobs.length, 1);

  console.log("EngageOS durable WhatsApp ingress tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
