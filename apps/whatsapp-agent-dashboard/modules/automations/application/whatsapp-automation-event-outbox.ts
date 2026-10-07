import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/prisma";

export const WHATSAPP_AUTOMATION_TRIGGERS = [
  "INCOMING_KEYWORD",
  "NEW_LEAD",
  "CONTACT_CREATED",
  "FORM_STARTED",
  "FORM_ABANDONED",
  "FORM_SUBMITTED",
  "CHECKOUT_STARTED",
  "PAYMENT_PENDING",
  "PAYMENT_ABANDONED",
  "PAYMENT_PAID",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_REMINDER",
  "TAG_ADDED",
  "STAGE_CHANGED",
  "FOLLOW_UP_DUE",
  "NO_REPLY",
  "SCHEDULE",
  "WEBHOOK",
] as const;

export type WhatsAppAutomationTrigger = (typeof WHATSAPP_AUTOMATION_TRIGGERS)[number];

export type WhatsAppAutomationEventInput = {
  workspaceId: string;
  sourceEventId: string;
  trigger: WhatsAppAutomationTrigger;
  relatedTriggers?: readonly WhatsAppAutomationTrigger[];
  conversationId?: string | null;
  contactId?: string | null;
  availableAt?: Date | null;
  payload: Readonly<Record<string, unknown>>;
};

function required(value: string | null | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`WhatsApp automation event ${label} is required.`);
  return normalized;
}

export function buildWhatsAppAutomationEventKey(input: Pick<WhatsAppAutomationEventInput, "sourceEventId" | "trigger">) {
  const source = required(input.sourceEventId, "sourceEventId").toLowerCase();
  const digest = createHash("sha256").update(`${source}:${input.trigger}`).digest("hex");
  return `whatsapp:event:${digest}`;
}

export async function findActorWhatsAppWorkspaceId(actorUserId: string): Promise<string | null> {
  const membership = await prisma.engageWorkspaceMembership.findFirst({
    where: { userId: actorUserId, isActive: true, workspace: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  return membership?.workspaceId ?? null;
}

export async function enqueueWhatsAppAutomationEvent(
  tx: Prisma.TransactionClient,
  input: WhatsAppAutomationEventInput,
) {
  const workspaceId = required(input.workspaceId, "workspaceId");
  const sourceEventId = required(input.sourceEventId, "sourceEventId");
  const eventKey = buildWhatsAppAutomationEventKey(input);
  const relatedTriggers = Array.from(new Set(input.relatedTriggers ?? [])).filter(
    (trigger) => trigger !== input.trigger,
  );
  return tx.engageWhatsAppAutomationEvent.upsert({
    where: { workspaceId_eventKey: { workspaceId, eventKey } },
    update: {},
    create: {
      workspaceId,
      eventKey,
      sourceEventId,
      trigger: input.trigger,
      relatedTriggers: relatedTriggers as unknown as Prisma.InputJsonValue,
      conversationId: input.conversationId?.trim() || null,
      contactId: input.contactId?.trim() || null,
      availableAt: input.availableAt ?? new Date(),
      payload: JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue,
    },
  });
}

export async function supersedePendingWhatsAppAutomationEvents(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    trigger: WhatsAppAutomationTrigger;
    conversationId?: string | null;
    contactId?: string | null;
    sourceEventIdPrefix?: string | null;
  },
) {
  return tx.engageWhatsAppAutomationEvent.updateMany({
    where: {
      workspaceId: required(input.workspaceId, "workspaceId"),
      trigger: input.trigger,
      status: "PENDING",
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.sourceEventIdPrefix ? { sourceEventId: { startsWith: input.sourceEventIdPrefix } } : {}),
    },
    data: {
      status: "PROCESSED",
      processedAt: new Date(),
      lastError: "SUPERSEDED_BY_NEWER_EVENT",
    },
  });
}
