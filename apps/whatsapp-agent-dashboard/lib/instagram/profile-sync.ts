import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";
import { fetchInstagramProfile } from "./api-client";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function senderIds(payload: unknown): string[] {
  const root = asRecord(payload);
  if (root.object !== "instagram") return [];

  const ids = new Set<string>();
  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const entryValue of entries) {
    const entry = asRecord(entryValue);
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const itemValue of messaging) {
      const item = asRecord(itemValue);
      const message = asRecord(item.message);
      const senderId = stringValue(asRecord(item.sender).id);
      if (senderId && message.is_echo !== true) ids.add(senderId);
    }
  }
  return [...ids];
}

export async function syncInstagramProfilesFromWebhook(payload: unknown): Promise<void> {
  for (const instagramScopedId of senderIds(payload)) {
    try {
      const profile = await fetchInstagramProfile(instagramScopedId);
      const waId = `instagram:${instagramScopedId}`;
      const existing = await prisma.whatsAppContact.findUnique({
        where: { waId },
        select: { metadata: true },
      });
      if (!existing) continue;

      const currentMetadata = asRecord(existing.metadata);
      const displayName = profile.name || profile.username || `Instagram • ${instagramScopedId.slice(-6)}`;
      const profileName = profile.username ? `@${profile.username}` : displayName;

      await prisma.whatsAppContact.update({
        where: { waId },
        data: {
          displayName,
          profileName,
          metadata: toJson({
            ...currentMetadata,
            channel: "instagram",
            instagramScopedId,
            instagramName: profile.name,
            instagramUsername: profile.username,
            instagramProfilePic: profile.profilePic,
            instagramProfileSyncedAt: new Date().toISOString(),
          }),
        },
      });
    } catch {
      // The message itself has already been persisted. A later inbound message
      // retries profile enrichment without making Meta retry the webhook.
    }
  }
}
