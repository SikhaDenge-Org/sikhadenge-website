import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type {
  DeadLetterEntry,
  DeadLetterStore,
  DurableEventInput,
  DurableEventStore,
  EventProcessingState,
  StoredDurableEvent,
} from "@/modules/events/application/event-runtime";

const RUNTIME_PAYLOAD_KEY = "__engageosRuntimeV1";
const RETRY_PREFIX = "ENGAGEOS_RETRY:";
const DEAD_PREFIX = "ENGAGEOS_DEAD_LETTER:";

function eventPayload(event: DurableEventInput, correlationId: string): Prisma.InputJsonObject {
  return {
    [RUNTIME_PAYLOAD_KEY]: {
      id: event.id,
      workspaceId: event.workspaceId,
      connectionId: event.connectionId,
      channel: event.channel,
      correlationId,
      occurredAt: event.occurredAt.toISOString(),
      receivedAt: event.receivedAt.toISOString(),
      payload: event.payload as Prisma.InputJsonObject,
    },
  };
}

function asObject(value: Prisma.JsonValue): Prisma.JsonObject {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Durable event payload is not an object.");
  }
  return value as Prisma.JsonObject;
}

function requiredString(value: Prisma.JsonValue | undefined, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Durable event ${field} is missing.`);
  }
  return value;
}

function parseDate(value: Prisma.JsonValue | undefined, field: string): Date {
  const text = requiredString(value, field);
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) throw new Error(`Durable event ${field} is invalid.`);
  return date;
}

function stateFromRow(row: {
  processedAt: Date | null;
  processingError: string | null;
  attemptCount: number;
}): EventProcessingState {
  if (row.processedAt) return "PROCESSED";
  if (row.processingError?.startsWith(DEAD_PREFIX)) return "DEAD_LETTER";
  if (row.processingError?.startsWith(RETRY_PREFIX)) return "RETRY_WAIT";
  if (row.attemptCount > 0) return "PROCESSING";
  return "QUEUED";
}

function errorFromRow(value: string | null): string | undefined {
  if (!value) return undefined;
  if (value.startsWith(RETRY_PREFIX)) return value.slice(RETRY_PREFIX.length);
  if (value.startsWith(DEAD_PREFIX)) return value.slice(DEAD_PREFIX.length);
  return value;
}

function toStored(row: {
  id: string;
  eventKey: string;
  eventType: string;
  payload: Prisma.JsonValue;
  processedAt: Date | null;
  processingError: string | null;
  attemptCount: number;
  receivedAt: Date;
}): StoredDurableEvent {
  const root = asObject(row.payload);
  const runtime = asObject(root[RUNTIME_PAYLOAD_KEY] ?? null);
  const businessPayload = runtime.payload;
  const payload =
    businessPayload && typeof businessPayload === "object" && !Array.isArray(businessPayload)
      ? (businessPayload as Readonly<Record<string, unknown>>)
      : {};

  return {
    id: requiredString(runtime.id, "id"),
    eventKey: row.eventKey,
    workspaceId: requiredString(runtime.workspaceId, "workspaceId"),
    connectionId: requiredString(runtime.connectionId, "connectionId"),
    channel: requiredString(runtime.channel, "channel"),
    eventType: row.eventType,
    payload,
    occurredAt: parseDate(runtime.occurredAt, "occurredAt"),
    receivedAt: parseDate(runtime.receivedAt, "receivedAt"),
    state: stateFromRow(row),
    attempts: row.attemptCount,
    correlationId: requiredString(runtime.correlationId, "correlationId"),
    lastError: errorFromRow(row.processingError),
    processedAt: row.processedAt ?? undefined,
  };
}

export class PrismaWebhookEventStore implements DurableEventStore {
  async reserve(event: DurableEventInput, correlationId: string) {
    try {
      const row = await prisma.webhookEvent.create({
        data: {
          id: event.id,
          eventKey: event.eventKey,
          eventType: event.eventType,
          payload: eventPayload(event, correlationId),
          receivedAt: event.receivedAt,
        },
      });
      return { created: true, event: toStored(row) };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
      const existing = await prisma.webhookEvent.findUnique({ where: { eventKey: event.eventKey } });
      if (!existing) throw error;
      return { created: false, event: toStored(existing) };
    }
  }

  async getById(eventId: string) {
    const row = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
    return row ? toStored(row) : null;
  }

  async markQueued(eventId: string) {
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { processingError: null },
    });
  }

  async markProcessing(eventId: string, attempt: number) {
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { attemptCount: attempt, processingError: null },
    });
  }

  async markRetry(eventId: string, attempt: number, error: string) {
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { attemptCount: attempt, processingError: `${RETRY_PREFIX}${error}` },
    });
  }

  async markProcessed(eventId: string, processedAt: Date) {
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { processedAt, processingError: null },
    });
  }

  async markDeadLetter(eventId: string, attempt: number, error: string) {
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { attemptCount: attempt, processingError: `${DEAD_PREFIX}${error}` },
    });
  }
}

export class PrismaAuditDeadLetterStore implements DeadLetterStore {
  async append(entry: DeadLetterEntry) {
    await prisma.auditLog.create({
      data: {
        action: "ENGAGEOS_EVENT_DEAD_LETTER",
        entityType: "WebhookEvent",
        entityId: entry.eventId,
        after: {
          eventKey: entry.eventKey,
          correlationId: entry.correlationId,
          attempts: entry.attempts,
          failedAt: entry.failedAt.toISOString(),
          error: entry.error,
        },
      },
    });
  }
}

export function createPrismaEventRuntimePersistence(): {
  store: DurableEventStore;
  deadLetters: DeadLetterStore;
} {
  return {
    store: new PrismaWebhookEventStore(),
    deadLetters: new PrismaAuditDeadLetterStore(),
  };
}
