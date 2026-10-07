import {
  processNextEvent,
  type DeadLetterStore,
  type DurableEventStore,
  type EventProcessor,
  type EventQueue,
  type RetryPolicy,
} from "@/modules/events/application/event-runtime";

export type EventWorkerDependencies = {
  store: DurableEventStore;
  queue: EventQueue;
  deadLetters: DeadLetterStore;
  processor: EventProcessor;
  retryPolicy: RetryPolicy;
};

export async function runEventWorkerOnce(deps: EventWorkerDependencies): Promise<string> {
  return processNextEvent(deps);
}

export async function runEventWorkerLoop(input: EventWorkerDependencies & {
  signal: AbortSignal;
  idleDelayMs?: number;
}): Promise<void> {
  const idleDelayMs = input.idleDelayMs ?? 250;
  if (!Number.isFinite(idleDelayMs) || idleDelayMs < 25) {
    throw new Error("idleDelayMs must be at least 25ms.");
  }

  while (!input.signal.aborted) {
    const result = await processNextEvent(input);
    if (result === "IDLE") {
      await new Promise<void>((resolve) => setTimeout(resolve, idleDelayMs));
    }
  }
}
