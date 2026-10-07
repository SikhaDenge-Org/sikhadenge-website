export type EventProcessingState =
  | "RECEIVED"
  | "QUEUED"
  | "PROCESSING"
  | "RETRY_WAIT"
  | "PROCESSED"
  | "DEAD_LETTER";

export type DurableEventInput = {
  id: string;
  eventKey: string;
  workspaceId: string;
  connectionId: string;
  channel: string;
  eventType: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt: Date;
  receivedAt: Date;
};

export type StoredDurableEvent = DurableEventInput & {
  state: EventProcessingState;
  attempts: number;
  correlationId: string;
  lastError?: string;
  processedAt?: Date;
};

export type EventJob = {
  eventId: string;
  eventKey: string;
  attempt: number;
  availableAt: string;
  correlationId: string;
};

export type DeadLetterEntry = {
  eventId: string;
  eventKey: string;
  correlationId: string;
  attempts: number;
  failedAt: Date;
  error: string;
};

export interface DurableEventStore {
  reserve(
    event: DurableEventInput,
    correlationId: string,
  ): Promise<{ created: boolean; event: StoredDurableEvent }>;
  getById(eventId: string): Promise<StoredDurableEvent | null>;
  markQueued(eventId: string): Promise<void>;
  markProcessing(eventId: string, attempt: number): Promise<void>;
  markRetry(eventId: string, attempt: number, error: string): Promise<void>;
  markProcessed(eventId: string, processedAt: Date): Promise<void>;
  markDeadLetter(eventId: string, attempt: number, error: string): Promise<void>;
}

export interface EventQueue {
  enqueue(job: EventJob): Promise<void>;
  dequeueDue(now: Date): Promise<EventJob | null>;
}

export interface DeadLetterStore {
  append(entry: DeadLetterEntry): Promise<void>;
}

export type EventProcessor = (event: StoredDurableEvent) => Promise<void>;

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export class PermanentEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentEventError";
  }
}

export class RetryableEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableEventError";
  }
}

function nonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must be a non-empty string.`);
  return normalized;
}

export function assertRetryPolicy(policy: RetryPolicy): void {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new Error("maxAttempts must be a positive integer.");
  }
  if (!Number.isFinite(policy.baseDelayMs) || policy.baseDelayMs < 1) {
    throw new Error("baseDelayMs must be positive.");
  }
  if (!Number.isFinite(policy.maxDelayMs) || policy.maxDelayMs < policy.baseDelayMs) {
    throw new Error("maxDelayMs must be greater than or equal to baseDelayMs.");
  }
}

export function retryDelayMs(attempt: number, policy: RetryPolicy): number {
  assertRetryPolicy(policy);
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error("attempt must be a positive integer.");
  }
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
}

export function sanitizeProcessingError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error).slice(0, 1000);
}

export async function ingestDurableEvent(input: {
  event: DurableEventInput;
  correlationId: string;
  store: DurableEventStore;
  queue: EventQueue;
  now?: Date;
}): Promise<{ duplicate: boolean; event: StoredDurableEvent }> {
  nonEmpty(input.event.id, "event.id");
  nonEmpty(input.event.eventKey, "event.eventKey");
  nonEmpty(input.correlationId, "correlationId");

  const reserved = await input.store.reserve(input.event, input.correlationId);
  if (!reserved.created) return { duplicate: true, event: reserved.event };

  const now = input.now ?? new Date();
  await input.queue.enqueue({
    eventId: input.event.id,
    eventKey: input.event.eventKey,
    attempt: 1,
    availableAt: now.toISOString(),
    correlationId: input.correlationId,
  });
  await input.store.markQueued(input.event.id);
  const queued = await input.store.getById(input.event.id);
  if (!queued) throw new Error("Reserved event disappeared after queueing.");
  return { duplicate: false, event: queued };
}

export async function processNextEvent(input: {
  store: DurableEventStore;
  queue: EventQueue;
  deadLetters: DeadLetterStore;
  processor: EventProcessor;
  retryPolicy: RetryPolicy;
  now?: Date;
}): Promise<"IDLE" | "PROCESSED" | "RETRY_SCHEDULED" | "DEAD_LETTERED"> {
  assertRetryPolicy(input.retryPolicy);
  const now = input.now ?? new Date();
  const job = await input.queue.dequeueDue(now);
  if (!job) return "IDLE";

  const event = await input.store.getById(job.eventId);
  if (!event) {
    await input.deadLetters.append({
      eventId: job.eventId,
      eventKey: job.eventKey,
      correlationId: job.correlationId,
      attempts: job.attempt,
      failedAt: now,
      error: "Event record missing for queued job.",
    });
    return "DEAD_LETTERED";
  }

  if (event.state === "PROCESSED") return "PROCESSED";
  await input.store.markProcessing(event.id, job.attempt);

  try {
    await input.processor(event);
    await input.store.markProcessed(event.id, now);
    return "PROCESSED";
  } catch (error) {
    const message = sanitizeProcessingError(error);
    const permanent = error instanceof PermanentEventError;
    const exhausted = job.attempt >= input.retryPolicy.maxAttempts;

    if (permanent || exhausted) {
      await input.store.markDeadLetter(event.id, job.attempt, message);
      await input.deadLetters.append({
        eventId: event.id,
        eventKey: event.eventKey,
        correlationId: event.correlationId,
        attempts: job.attempt,
        failedAt: now,
        error: message,
      });
      return "DEAD_LETTERED";
    }

    await input.store.markRetry(event.id, job.attempt, message);
    const nextAttempt = job.attempt + 1;
    const delayMs = retryDelayMs(job.attempt, input.retryPolicy);
    await input.queue.enqueue({
      ...job,
      attempt: nextAttempt,
      availableAt: new Date(now.getTime() + delayMs).toISOString(),
    });
    return "RETRY_SCHEDULED";
  }
}
