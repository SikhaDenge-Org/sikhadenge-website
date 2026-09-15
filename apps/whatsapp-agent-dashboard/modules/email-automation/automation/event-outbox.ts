import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { EmailAutomationTrigger } from "./contracts";

export const EMAIL_EVENT_STATUS = ["PENDING", "PROCESSING", "PROCESSED", "FAILED"] as const;
export type EmailAutomationEventStatus = (typeof EMAIL_EVENT_STATUS)[number];

export type EmailAutomationEventInput = {
  workspaceId: string;
  sourceEventId: string;
  trigger: EmailAutomationTrigger;
  relatedTriggers?: readonly EmailAutomationTrigger[];
  contactId?: string | null;
  leadId?: string | null;
  submissionId?: string | null;
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
      payload: JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue,
    },
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