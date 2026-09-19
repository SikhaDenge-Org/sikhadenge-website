import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { enqueueEmailAutomationEvent, supersedePendingEmailAutomationEvents } from "../automation/event-outbox";
import { resolveWorkspaceSafeTrackingContactId } from "../analytics/workspace-safe-attribution";

function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function normalizedEmail(value: unknown): string {
  const email = clean(value, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email address is required.");
  return email;
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function eventKey(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

function optionalNormalizedEmail(value: unknown): string | null {
  const email = clean(value, 320).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function storedRecipientEmails(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const raw = (item as Record<string, unknown>).email;
      const email = optionalNormalizedEmail(raw);
      return email ? [email] : [];
    });
  });
}

async function resolveWorkspaceBounceTarget(input: {
  workspaceId: string;
  connectionId: string | null;
  providerMessageId: string;
  providerThreadId: string | null;
  failedRecipient: string | null;
}): Promise<{ id: string } | null> {
  if (!input.connectionId) return null;

  const exact = await prisma.engageEmailMessage.findFirst({
    where: {
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      providerMessageId: input.providerMessageId,
      externalRequestSent: true,
      status: { in: ["SENT", "DELIVERED"] },
    },
    select: { id: true },
  });
  if (exact) return exact;

  if (!input.providerThreadId) return null;
  const threadCandidates = await prisma.engageEmailMessage.findMany({
    where: {
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      providerThreadId: input.providerThreadId,
      externalRequestSent: true,
      status: { in: ["SENT", "DELIVERED"] },
    },
    orderBy: { sentAt: "desc" },
    take: 20,
    select: { id: true, toRecipients: true, ccRecipients: true, bccRecipients: true },
  });
  const candidates = input.failedRecipient
    ? threadCandidates.filter((row) =>
        storedRecipientEmails(row.toRecipients, row.ccRecipients, row.bccRecipients).includes(input.failedRecipient!),
      )
    : threadCandidates;
  return candidates.length === 1 ? { id: candidates[0].id } : null;
}

async function resolveWorkspaceSafeContactId(workspaceId: string, fromAddress: string): Promise<string | null> {
  const prior = await prisma.engageEmailInboundMessage.findFirst({
    where: {
      workspaceId,
      fromAddress: { equals: fromAddress, mode: "insensitive" },
      contactId: { not: null },
    },
    orderBy: { receivedAt: "desc" },
    select: { contactId: true },
  });
  if (prior?.contactId) return prior.contactId;

  const [automationRefs, analyticsRefs] = await Promise.all([
    prisma.engageEmailAutomationEvent.findMany({
      where: { workspaceId, contactId: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: { contactId: true },
    }),
    prisma.engageEmailAnalyticsEvent.findMany({
      where: { workspaceId, contactId: { not: null } },
      orderBy: { occurredAt: "desc" },
      take: 500,
      select: { contactId: true },
    }),
  ]);
  const ids = [...new Set([...automationRefs, ...analyticsRefs].map((row) => row.contactId).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return null;
  const matches = await prisma.whatsAppContact.findMany({
    where: { id: { in: ids }, email: { equals: fromAddress, mode: "insensitive" } },
    select: { id: true },
    take: 2,
  });
  return matches.length === 1 ? matches[0].id : null;
}

export async function ingestWorkspaceSafeInboundEmail(input: {
  workspaceId: string;
  connectionId?: string | null;
  provider: string;
  providerMessageId: string;
  providerThreadId?: string | null;
  from: string;
  to?: unknown;
  cc?: unknown;
  replyTo?: unknown;
  subject?: string;
  snippet?: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: unknown;
  classification?: "INBOUND" | "BOUNCE";
  bounceRecipient?: string | null;
  bounceClass?: "HARD" | "SOFT" | "UNKNOWN" | null;
  bounceStatusCode?: string | null;
  receivedAt?: string;
}) {
  const provider = clean(input.provider, 40);
  const providerMessageId = clean(input.providerMessageId, 240);
  if (!provider || !providerMessageId) throw new Error("provider and providerMessageId are required.");
  const from = normalizedEmail(input.from);
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
  if (Number.isNaN(receivedAt.getTime())) throw new Error("receivedAt is invalid.");

  const prior = await prisma.engageEmailInboundMessage.findUnique({
    where: { workspaceId_provider_providerMessageId: { workspaceId: input.workspaceId, provider, providerMessageId } },
  });
  if (prior) return { message: prior, replayed: true };

  const connectionId = clean(input.connectionId, 100) || null;
  const threadId = clean(input.providerThreadId, 240) || null;
  const classification = input.classification === "BOUNCE" ? "BOUNCE" : "INBOUND";
  const bounceRecipient = classification === "BOUNCE" ? optionalNormalizedEmail(input.bounceRecipient) : null;
  const bounceClass = classification === "BOUNCE" && ["HARD", "SOFT", "UNKNOWN"].includes(String(input.bounceClass))
    ? input.bounceClass as "HARD" | "SOFT" | "UNKNOWN"
    : classification === "BOUNCE" ? "UNKNOWN" : null;
  const bounceStatusCode = classification === "BOUNCE" && typeof input.bounceStatusCode === "string" && /^[245]\.\d{1,3}\.\d{1,3}$/.test(input.bounceStatusCode.trim())
    ? input.bounceStatusCode.trim()
    : null;
  const bounceTarget = classification === "BOUNCE"
    ? await resolveWorkspaceBounceTarget({
        workspaceId: input.workspaceId,
        connectionId,
        providerMessageId,
        providerThreadId: threadId,
        failedRecipient: bounceRecipient,
      })
    : null;
  const contactId = classification === "BOUNCE"
    ? (bounceTarget ? await resolveWorkspaceSafeTrackingContactId({ workspaceId: input.workspaceId, messageId: bounceTarget.id }) : null)
    : await resolveWorkspaceSafeContactId(input.workspaceId, from);

  return prisma.$transaction(async (tx) => {
    const stored = await tx.engageEmailInboundMessage.create({
      data: {
        workspaceId: input.workspaceId,
        connectionId,
        provider,
        providerMessageId,
        providerThreadId: threadId,
        contactId,
        fromAddress: from,
        toRecipients: json(arr(input.to)),
        ccRecipients: json(arr(input.cc)),
        replyTo: input.replyTo ? json(input.replyTo) : Prisma.JsonNull,
        subject: clean(input.subject, 500),
        snippet: clean(input.snippet, 1000) || null,
        bodyText: clean(input.bodyText, 100000) || null,
        bodyHtml: clean(input.bodyHtml, 200000) || null,
        attachments: json(arr(input.attachments)),
        classification,
        receivedAt,
      },
    });

    if (classification === "BOUNCE") {
      if (bounceTarget) {
        await tx.engageEmailMessage.update({
          where: { id: bounceTarget.id },
          data: {
            status: "BOUNCED",
            lastError: bounceRecipient
              ? `Provider reported a ${bounceClass?.toLowerCase() ?? "unknown"} bounce for ${bounceRecipient}${bounceStatusCode ? ` (${bounceStatusCode})` : ""}.`
              : `Provider reported a ${bounceClass?.toLowerCase() ?? "unknown"} bounce${bounceStatusCode ? ` (${bounceStatusCode})` : ""}.`,
          },
        });
        await tx.engageEmailAnalyticsEvent.create({
          data: {
            workspaceId: input.workspaceId,
            messageId: bounceTarget.id,
            inboundMessageId: stored.id,
            contactId,
            eventType: "BOUNCED",
            provider,
            eventKey: eventKey(["bounce", stored.id]),
            metadata: json({
              failedRecipient: bounceRecipient,
              bounceClass,
              statusCode: bounceStatusCode,
            }),
            occurredAt: receivedAt,
          },
        });
        if (contactId && bounceClass === "HARD") {
          const activeHardBounceSuppression = await tx.engageCustomerSuppression.findFirst({
            where: {
              workspaceId: input.workspaceId,
              customerRef: contactId,
              channel: "EMAIL",
              reason: "EMAIL_HARD_BOUNCE",
              revokedAt: null,
              startsAt: { lte: receivedAt },
              OR: [{ expiresAt: null }, { expiresAt: { gt: receivedAt } }],
            },
            select: { id: true },
          });
          if (!activeHardBounceSuppression) {
            await tx.engageCustomerSuppression.create({
              data: {
                workspaceId: input.workspaceId,
                customerRef: contactId,
                connectionId: null,
                channel: "EMAIL",
                purposes: json(["ALL"]),
                reason: "EMAIL_HARD_BOUNCE",
                startsAt: receivedAt,
              },
            });
          }
        }
        if (contactId) await enqueueEmailAutomationEvent(tx, {
          workspaceId: input.workspaceId,
          sourceEventId: stored.id,
          trigger: "EMAIL_BOUNCED",
          contactId,
          payload: {
            inboundMessageId: stored.id,
            messageId: bounceTarget.id,
            providerMessageId,
            failedRecipient: bounceRecipient,
            bounceClass,
            statusCode: bounceStatusCode,
          },
        });
      }
    } else {
      await tx.engageEmailAnalyticsEvent.create({
        data: { workspaceId: input.workspaceId, inboundMessageId: stored.id, contactId, eventType: "RECEIVED", provider, eventKey: eventKey(["received", stored.id]), occurredAt: receivedAt },
      });
      if (contactId) await enqueueEmailAutomationEvent(tx, { workspaceId: input.workspaceId, sourceEventId: stored.id, trigger: "EMAIL_RECEIVED", relatedTriggers: [], contactId, payload: { inboundMessageId: stored.id, subject: stored.subject, fromAddress: from, providerThreadId: threadId } });
      const sent = threadId ? await tx.engageEmailMessage.findFirst({
        where: { workspaceId: input.workspaceId, providerThreadId: threadId, status: { in: ["SENT", "DELIVERED"] } },
        orderBy: { sentAt: "desc" },
      }) : null;
      if (sent && contactId) {
        await tx.engageEmailAnalyticsEvent.create({
          data: { workspaceId: input.workspaceId, messageId: sent.id, inboundMessageId: stored.id, contactId, eventType: "REPLIED", provider, eventKey: eventKey(["reply", stored.id]), occurredAt: receivedAt },
        });
        await enqueueEmailAutomationEvent(tx, { workspaceId: input.workspaceId, sourceEventId: stored.id, trigger: "EMAIL_REPLIED", contactId, payload: { inboundMessageId: stored.id, messageId: sent.id, providerThreadId: threadId } });
        await supersedePendingEmailAutomationEvents(tx, { workspaceId: input.workspaceId, trigger: "NO_REPLY", contactId });
      }
    }
    return { message: stored, replayed: false };
  });
}
