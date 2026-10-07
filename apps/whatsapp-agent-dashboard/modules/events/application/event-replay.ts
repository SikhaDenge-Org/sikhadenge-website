import type {
  DurableEventStore,
  EventJob,
  EventQueue,
  StoredDurableEvent,
} from "@/modules/events/application/event-runtime";

export async function replayDeadLetterEvent(input: {
  eventId: string;
  store: DurableEventStore;
  queue: EventQueue;
  correlationId: string;
  now?: Date;
}): Promise<StoredDurableEvent> {
  if (!input.eventId.trim()) throw new Error("eventId is required for replay.");
  if (!input.correlationId.trim()) throw new Error("correlationId is required for replay.");

  const event = await input.store.getById(input.eventId);
  if (!event) throw new Error("Dead-letter event was not found.");
  if (event.state !== "DEAD_LETTER") {
    throw new Error("Only a dead-letter event may be replayed.");
  }

  const now = input.now ?? new Date();
  const job: EventJob = {
    eventId: event.id,
    eventKey: event.eventKey,
    attempt: 1,
    availableAt: now.toISOString(),
    correlationId: input.correlationId,
  };

  await input.queue.enqueue(job);
  await input.store.markQueued(event.id);
  const queued = await input.store.getById(event.id);
  if (!queued) throw new Error("Replayed event disappeared after queueing.");
  return queued;
}
