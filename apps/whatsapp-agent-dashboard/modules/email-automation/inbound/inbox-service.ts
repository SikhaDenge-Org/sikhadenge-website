import { prisma } from "@/lib/db/prisma";

function clampLimit(value: number | undefined, fallback = 50, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function storedAddressList(value: unknown): Array<{ email: string; name?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.includes("@")) return [{ email: item.trim().toLowerCase() }];
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.email !== "string" || !row.email.includes("@")) return [];
    return [{
      email: row.email.trim().toLowerCase(),
      ...(typeof row.name === "string" && row.name.trim() ? { name: row.name.trim() } : {}),
    }];
  });
}

function attachmentCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function emailInboxThreadIdentity(input: {
  provider: string;
  connectionId?: string | null;
  providerThreadId?: string | null;
  providerMessageId: string;
}) {
  const provider = safeString(input.provider) || "UNKNOWN";
  const connectionId = safeString(input.connectionId) || "unbound";
  const threadId = safeString(input.providerThreadId) || safeString(input.providerMessageId);
  const threadKind = safeString(input.providerThreadId) ? "THREAD" : "MESSAGE";
  return {
    key: `${provider}:${connectionId}:${threadKind}:${threadId}`,
    provider,
    connectionId: input.connectionId ?? null,
    threadId,
    threadKind: threadKind as "THREAD" | "MESSAGE",
  };
}

export async function listEmailInboxThreads(input: { workspaceId: string; limit?: number }) {
  const limit = clampLimit(input.limit);
  const rows = await prisma.engageEmailInboundMessage.findMany({
    where: { workspaceId: input.workspaceId, classification: "INBOUND" },
    orderBy: { receivedAt: "desc" },
    take: Math.min(limit * 6, 600),
    select: {
      id: true,
      provider: true,
      connectionId: true,
      providerMessageId: true,
      providerThreadId: true,
      contactId: true,
      fromAddress: true,
      toRecipients: true,
      ccRecipients: true,
      subject: true,
      snippet: true,
      bodyText: true,
      attachments: true,
      receivedAt: true,
    },
  });

  const contactIds = [...new Set(rows.map((row) => row.contactId).filter((value): value is string => Boolean(value)))];
  const contacts = contactIds.length
    ? await prisma.whatsAppContact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, displayName: true, profileName: true, email: true, phone: true },
      })
    : [];
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));

  const grouped = new Map<string, {
    identity: ReturnType<typeof emailInboxThreadIdentity>;
    latest: (typeof rows)[number];
    messageCount: number;
    attachmentCount: number;
  }>();

  for (const row of rows) {
    const identity = emailInboxThreadIdentity(row);
    const existing = grouped.get(identity.key);
    if (!existing) {
      grouped.set(identity.key, {
        identity,
        latest: row,
        messageCount: 1,
        attachmentCount: attachmentCount(row.attachments),
      });
      continue;
    }
    existing.messageCount += 1;
    existing.attachmentCount += attachmentCount(row.attachments);
  }

  return [...grouped.values()]
    .sort((a, b) => b.latest.receivedAt.getTime() - a.latest.receivedAt.getTime())
    .slice(0, limit)
    .map(({ identity, latest, messageCount, attachmentCount: files }) => ({
      ...identity,
      latestInboundMessageId: latest.id,
      contact: latest.contactId ? contactById.get(latest.contactId) ?? null : null,
      fromAddress: latest.fromAddress,
      to: storedAddressList(latest.toRecipients),
      cc: storedAddressList(latest.ccRecipients),
      subject: latest.subject,
      preview: latest.snippet || latest.bodyText?.slice(0, 220) || "",
      receivedAt: latest.receivedAt.toISOString(),
      messageCount,
      attachmentCount: files,
    }));
}

export async function getEmailInboxThread(input: {
  workspaceId: string;
  provider: string;
  connectionId?: string | null;
  threadId: string;
  threadKind?: "THREAD" | "MESSAGE";
}) {
  const provider = safeString(input.provider);
  const threadId = safeString(input.threadId);
  if (!provider || !threadId) throw new Error("provider and threadId are required.");
  const threadKind = input.threadKind === "MESSAGE" ? "MESSAGE" : "THREAD";

  const inbound = await prisma.engageEmailInboundMessage.findMany({
    where: {
      workspaceId: input.workspaceId,
      provider,
      classification: "INBOUND",
      ...(input.connectionId ? { connectionId: input.connectionId } : {}),
      ...(threadKind === "THREAD"
        ? { providerThreadId: threadId }
        : { providerMessageId: threadId, providerThreadId: null }),
    },
    orderBy: { receivedAt: "asc" },
    take: 200,
  });
  if (!inbound.length) return null;

  const providerThreadId = threadKind === "THREAD" ? threadId : null;
  const outbound = providerThreadId
    ? await prisma.engageEmailMessage.findMany({
        where: {
          workspaceId: input.workspaceId,
          providerThreadId,
          ...(input.connectionId ? { connectionId: input.connectionId } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          status: true,
          toRecipients: true,
          ccRecipients: true,
          replyTo: true,
          subject: true,
          htmlBody: true,
          textBody: true,
          providerMessageId: true,
          providerThreadId: true,
          externalRequestSent: true,
          lastError: true,
          sentAt: true,
          createdAt: true,
        },
      })
    : [];

  const contactId = [...inbound].reverse().find((row) => row.contactId)?.contactId ?? null;
  const contact = contactId
    ? await prisma.whatsAppContact.findUnique({
        where: { id: contactId },
        select: { id: true, displayName: true, profileName: true, email: true, phone: true, city: true, consentStatus: true },
      })
    : null;

  const events = [
    ...inbound.map((row) => ({
      kind: "INBOUND" as const,
      at: row.receivedAt.toISOString(),
      message: {
        id: row.id,
        fromAddress: row.fromAddress,
        to: storedAddressList(row.toRecipients),
        cc: storedAddressList(row.ccRecipients),
        replyTo: row.replyTo,
        subject: row.subject,
        snippet: row.snippet,
        bodyText: row.bodyText,
        bodyHtml: row.bodyHtml,
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
        providerMessageId: row.providerMessageId,
        providerThreadId: row.providerThreadId,
      },
    })),
    ...outbound.map((row) => ({
      kind: "OUTBOUND" as const,
      at: (row.sentAt ?? row.createdAt).toISOString(),
      message: {
        id: row.id,
        status: row.status,
        to: storedAddressList(row.toRecipients),
        cc: storedAddressList(row.ccRecipients),
        replyTo: row.replyTo,
        subject: row.subject,
        bodyText: row.textBody,
        bodyHtml: row.htmlBody,
        providerMessageId: row.providerMessageId,
        providerThreadId: row.providerThreadId,
        externalRequestSent: row.externalRequestSent,
        lastError: row.lastError,
      },
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return {
    identity: emailInboxThreadIdentity(inbound[inbound.length - 1]),
    contact,
    events,
  };
}
