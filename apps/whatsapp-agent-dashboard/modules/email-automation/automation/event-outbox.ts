import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { EmailAutomationTrigger } from "./contracts";

export const EMAIL_EVENT_STATUS = ["PENDING", "PROCESSING", "PROCESSED", "FAILED"] as const;
export type EmailAutomationEventStatus = (typeof EMAIL_EVENT_STATUS)[number];

export function assertEmailAutomationEventRequeueAllowed(
  status: string,
  attemptCount: number,
  maxAttempts = 5,
): void {
  const limit = Math.min(Math.max(maxAttempts, 1), 20);
  if (status !== "FAILED") throw new Error("Only FAILED email automation events can be requeued.");
  if (!Number.isInteger(attemptCount) || attemptCount < 0) throw new Error("Email automation attempt count is invalid.");
  if (attemptCount >= limit) throw new Error(`Email automation event reached the retry limit of ${limit} attempts.`);
}

export type EmailAutomationEventInput = {
  workspaceId: string;
  sourceEventId: string;
  trigger: EmailAutomationTrigger;
  relatedTriggers?: readonly EmailAutomationTrigger[];
  contactId?: string | null;
  leadId?: string | null;
  submissionId?: string | null;
  availableAt?: Date | null;
  payload: Readonly<Record<string, unknown>>;
};

function safe(value: string | null | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Email automation event ${label} is required.`);
  return normalized;
}

export function buildEmailAutomationEventKey(
  input: Pick<EmailAutomationEventInput, "sourceEventId" | "trigger">,
) {
  return `email:event:${safe(input.sourceEventId, "sourceEventId").toLowerCase()}:${input.trigger.toLowerCase()}`;
}

export async function findActorEmailWorkspaceId(actorUserId: string): Promise<string | null> {
  const membership = await prisma.engageWorkspaceMembership.findFirst({
    where: { userId: actorUserId, isActive: true, workspace: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  return membership?.workspaceId ?? null;
}

export async function enqueueEmailAutomationEvent(
  tx: Prisma.TransactionClient,
  input: EmailAutomationEventInput,
) {
  const eventKey = buildEmailAutomationEventKey(input);
  const relatedTriggers = Array.from(new Set(input.relatedTriggers ?? [])).filter(
    (trigger) => trigger !== input.trigger,
  );
  return tx.engageEmailAutomationEvent.upsert({
    where: { workspaceId_eventKey: { workspaceId: input.workspaceId, eventKey } },
    update: {},
    create: {
      workspaceId: safe(input.workspaceId, "workspaceId"),
      eventKey,
      sourceEventId: safe(input.sourceEventId, "sourceEventId"),
      trigger: input.trigger,
      relatedTriggers: relatedTriggers as Prisma.InputJsonValue,
      contactId: input.contactId?.trim() || null,
      leadId: input.leadId?.trim() || null,
      submissionId: input.submissionId?.trim() || null,
      availableAt: input.availableAt ?? new Date(),
      payload: JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue,
    },
  });
}

export async function supersedePendingEmailAutomationEvents(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; trigger: EmailAutomationTrigger; leadId?: string | null; contactId?: string | null; sourceEventIdPrefix?: string | null },
) {
  return tx.engageEmailAutomationEvent.updateMany({
    where: {
      workspaceId: input.workspaceId,
      trigger: input.trigger,
      status: "PENDING",
      ...(input.leadId ? { leadId: input.leadId } : {}),
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.sourceEventIdPrefix ? { sourceEventId: { startsWith: input.sourceEventIdPrefix } } : {}),
    },
    data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
  });
}

export async function listEmailAutomationEvents(input: {
  workspaceId: string;
  status?: EmailAutomationEventStatus;
  take?: number;
}) {
  return prisma.engageEmailAutomationEvent.findMany({
    where: { workspaceId: input.workspaceId, ...(input.status ? { status: input.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(input.take ?? 50, 1), 200),
  });
}
export async function requeueFailedEmailAutomationEvent(input: {
  workspaceId: string;
  eventId: string;
  actorUserId: string;
  maxAttempts?: number;
}) {
  const maxAttempts = Math.min(Math.max(input.maxAttempts ?? 5, 1), 20);
  return prisma.$transaction(async (tx) => {
    const event = await tx.engageEmailAutomationEvent.findFirst({
      where: { id: input.eventId, workspaceId: input.workspaceId },
    });
    if (!event) throw new Error("Email automation event not found.");
    assertEmailAutomationEventRequeueAllowed(event.status, event.attemptCount, maxAttempts);
    const updated = await tx.engageEmailAutomationEvent.update({
      where: { id: event.id },
      data: { status: "PENDING", lastError: null, processedAt: null },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: "EMAIL_AUTOMATION_EVENT_REQUEUED",
        entityType: "EngageEmailAutomationEvent",
        entityId: event.id,
        before: { status: event.status, attemptCount: event.attemptCount, lastError: event.lastError },
        after: { status: updated.status, attemptCount: updated.attemptCount, maxAttempts },
      },
    });
    return updated;
  });
}
