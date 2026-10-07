import assert from "node:assert/strict";

import {
  PermanentEventError,
  processNextEvent,
  replayDeadLetterEvent,
  type DeadLetterEntry,
  type DeadLetterStore,
  type DurableEventInput,
  type DurableEventStore,
  type EventJob,
  type EventQueue,
  type StoredDurableEvent,
} from "../modules";

class Store implements DurableEventStore {
  event: StoredDurableEvent;

  constructor(state: StoredDurableEvent["state"]) {
    const now = new Date("2026-09-09T12:00:00Z");
    this.event = {
      id: "event-dead",
      eventKey: "key-dead",
      workspaceId: "workspace",
      connectionId: "connection",
      channel: "WHATSAPP",
      eventType: "MESSAGE_RECEIVED",
      payload: {},
      occurredAt: now,
      receivedAt: now,
      state,
      attempts: 1,
      correlationId: "correlation-original",
    };
  }

  async reserve(event: DurableEventInput, correlationId: string) {
    return { created: false, event: { ...this.event, ...event, correlationId } };
  }
  async getById(eventId: string) {
    return eventId === this.event.id ? this.event : null;
  }
  async markQueued() {
    this.event = { ...this.event, state: "QUEUED", lastError: undefined };
  }
  async markProcessing(_eventId: string, attempt: number) {
    this.event = { ...this.event, state: "PROCESSING", attempts: attempt };
  }
  async markRetry(_eventId: string, attempt: number, error: string) {
    this.event = { ...this.event, state: "RETRY_WAIT", attempts: attempt, lastError: error };
  }
  async markProcessed(_eventId: string, processedAt: Date) {
    this.event = { ...this.event, state: "PROCESSED", processedAt };
  }
  async markDeadLetter(_eventId: string, attempt: number, error: string) {
    this.event = { ...this.event, state: "DEAD_LETTER", attempts: attempt, lastError: error };
  }
}

class Queue implements EventQueue {
  jobs: EventJob[] = [];
  async enqueue(job: EventJob) {
    this.jobs.push(job);
  }
  async dequeueDue(now: Date) {
    const index = this.jobs.findIndex((job) => Date.parse(job.availableAt) <= now.getTime());
    if (index < 0) return null;
    return this.jobs.splice(index, 1)[0] ?? null;
  }
}

class DeadLetters implements DeadLetterStore {
  entries: DeadLetterEntry[] = [];
  async append(entry: DeadLetterEntry) {
    this.entries.push(entry);
  }
}

async function main() {
  const replayStore = new Store("DEAD_LETTER");
  const replayQueue = new Queue();
  const replayed = await replayDeadLetterEvent({
    eventId: replayStore.event.id,
    store: replayStore,
    queue: replayQueue,
    correlationId: "correlation-replay-1",
    now: new Date("2026-09-09T13:00:00Z"),
  });
  assert.equal(replayed.state, "QUEUED");
  assert.equal(replayQueue.jobs.length, 1);
  assert.equal(replayQueue.jobs[0]?.attempt, 1);
  await assert.rejects(
    replayDeadLetterEvent({
      eventId: replayStore.event.id,
      store: replayStore,
      queue: replayQueue,
      correlationId: "correlation-replay-2",
    }),
    /Only a dead-letter event/,
  );

  const permanentStore = new Store("QUEUED");
  const permanentQueue = new Queue();
  const deadLetters = new DeadLetters();
  const now = new Date("2026-09-09T14:00:00Z");
  await permanentQueue.enqueue({
    eventId: permanentStore.event.id,
    eventKey: permanentStore.event.eventKey,
    attempt: 1,
    availableAt: now.toISOString(),
    correlationId: permanentStore.event.correlationId,
  });

  const result = await processNextEvent({
    store: permanentStore,
    queue: permanentQueue,
    deadLetters,
    processor: async () => {
      throw new PermanentEventError("invalid provider payload");
    },
    retryPolicy: { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 1000 },
    now,
  });
  assert.equal(result, "DEAD_LETTERED");
  assert.equal(permanentQueue.jobs.length, 0);
  assert.equal(deadLetters.entries.length, 1);
  assert.equal(permanentStore.event.state, "DEAD_LETTER");

  console.log("EngageOS event runtime exit-gate tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
