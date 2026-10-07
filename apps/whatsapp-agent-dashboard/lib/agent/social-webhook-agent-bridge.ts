import { prisma } from "../db/prisma";
import { sha256Hex } from "../meta/signature";
import {
  processSocialInboundAgentLifecycle,
  type SocialAgentChannel,
  type SocialAgentLifecycleResult,
} from "./social-agent-service";

export type SocialWebhookAgentBridgeResult = {
  matched: number;
  analyzed: number;
  queued: number;
  sent: number;
  handoffs: number;
  skipped: number;
  failed: number;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function messengerSyntheticMessageId(item: JsonRecord): string | null {
  const postback = asRecord(item.postback);
  const reaction = asRecord(item.reaction);
  const postbackTitle = stringValue(postback.title);
  const reactionText =
    stringValue(reaction.emoji) ||
    stringValue(reaction.reaction) ||
    stringValue(reaction.action);

  return postbackTitle || reactionText
    ? `messenger:${sha256Hex(JSON.stringify(item))}`
    : null;
}

export function extractSocialInboundMessageIds(input: {
  payload: unknown;
  channel: SocialAgentChannel;
}): string[] {
  const root = asRecord(input.payload);
  const expectedObject = input.channel === "instagram" ? "instagram" : "page";
  if (root.object !== expectedObject) return [];

  const ids = new Set<string>();
  const entries = Array.isArray(root.entry) ? root.entry : [];

  for (const entryValue of entries) {
    const entry = asRecord(entryValue);
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];

    for (const itemValue of messaging) {
      const item = asRecord(itemValue);
      const message = asRecord(item.message);
      if (message.is_echo === true) continue;

      const postback = asRecord(item.postback);
      const reaction = asRecord(item.reaction);
      const messageId =
        stringValue(message.mid) ||
        stringValue(postback.mid) ||
        stringValue(reaction.mid) ||
        (input.channel === "messenger"
          ? messengerSyntheticMessageId(item)
          : null);

      if (messageId) ids.add(messageId);
    }
  }

  return [...ids];
}

function applyLifecycleResult(
  result: SocialWebhookAgentBridgeResult,
  lifecycle: SocialAgentLifecycleResult,
) {
  if (lifecycle.analyzed) result.analyzed += 1;
  if (lifecycle.queued) result.queued += 1;
  if (lifecycle.sent) result.sent += 1;
  if (lifecycle.handoff) result.handoffs += 1;
  if (lifecycle.skipped) result.skipped += 1;
  if (lifecycle.failed) result.failed += 1;
}

export async function processSocialWebhookAgentBridge(input: {
  payload: unknown;
  channel: SocialAgentChannel;
}): Promise<SocialWebhookAgentBridgeResult> {
  const metaMessageIds = extractSocialInboundMessageIds(input);
  const result: SocialWebhookAgentBridgeResult = {
    matched: 0,
    analyzed: 0,
    queued: 0,
    sent: 0,
    handoffs: 0,
    skipped: 0,
    failed: 0,
  };

  for (const metaMessageId of metaMessageIds) {
    const stored = await prisma.whatsAppMessage.findUnique({
      where: { metaMessageId },
      select: {
        id: true,
        conversation: { select: { source: true } },
      },
    });

    if (
      !stored ||
      stored.conversation.source?.trim().toLowerCase() !== input.channel
    ) {
      result.skipped += 1;
      continue;
    }

    result.matched += 1;
    try {
      const lifecycle = await processSocialInboundAgentLifecycle({
        messageId: stored.id,
        channel: input.channel,
      });
      applyLifecycleResult(result, lifecycle);
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
