import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  instagramCommentActionMode,
  isRetriableInstagramError,
  sendInstagramPrivateCommentReply,
  sendInstagramPublicCommentReply,
} from "@/lib/instagram/comment-api-client";
import {
  instagramCommentIsSensitive,
  matchingInstagramCommentRules,
  parseInstagramCommentRulesJson,
  type InstagramCommentRule,
} from "@/modules/channels/instagram/application/comment-rules";
import { evaluateInstagramCommentAutomation } from "@/modules/channels/instagram/policy/comment-private-reply";
import {
  normalizeInstagramCommentWebhooks,
  type InstagramCommentWebhookEvent,
} from "@/modules/channels/instagram/mapping/comment-webhook";
import { listPersistedIntegrationHealth } from "@/modules/integrations/infrastructure/prisma-integration-health";

type Environment = Readonly<Record<string, string | undefined>>;

type ActionOutcome = {
  action: "PUBLIC_REPLY" | "PRIVATE_REPLY";
  status: "SENT" | "SKIPPED_ALREADY_SENT" | "DRY_RUN" | "FAILED_PERMANENT" | "UNKNOWN_PENDING";
  providerId?: string | null;
  recipientId?: string | null;
  reason?: string;
};

export type InstagramCommentAutomationResult = {
  enabled: boolean;
  commentsSeen: number;
  processed: number;
  duplicates: number;
  matched: number;
  humanReviews: number;
  actionsSent: number;
  dryRunActions: number;
};

const DEFAULT_PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_PRIVATE_REPLY_WINDOW_MS = DEFAULT_PRIVATE_REPLY_WINDOW_MS;

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function instagramCommentAutomationEnabled(env: Environment = process.env): boolean {
  return enabled(env.INSTAGRAM_COMMENT_AUTOMATION_ENABLED);
}

export function instagramPrivateReplyWindowMs(env: Environment = process.env): number {
  const configured = Number(env.INSTAGRAM_COMMENT_PRIVATE_REPLY_WINDOW_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_PRIVATE_REPLY_WINDOW_MS;
  return Math.min(Math.floor(configured), MAX_PRIVATE_REPLY_WINDOW_MS);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function commentEventKey(commentId: string): string {
  return `instagram:comment:${commentId}`;
}

function actionEventKey(commentId: string, action: "PUBLIC_REPLY" | "PRIVATE_REPLY"): string {
  return `instagram:comment-action:${action.toLowerCase()}:${commentId}`;
}

async function reserveCommentEvent(event: InstagramCommentWebhookEvent) {
  const key = commentEventKey(event.commentId);
  const existing = await prisma.webhookEvent.findUnique({ where: { eventKey: key } });
  if (existing?.processedAt) return { duplicate: true, row: existing };
  if (existing) {
    const row = await prisma.webhookEvent.update({
      where: { eventKey: key },
      data: { attemptCount: { increment: 1 }, processingError: null },
    });
    return { duplicate: false, row };
  }

  try {
    const row = await prisma.webhookEvent.create({
      data: {
        eventKey: key,
        eventType: "instagram.comment",
        payload: toJson({ event, receivedAt: new Date().toISOString() }),
        attemptCount: 1,
      },
    });
    return { duplicate: false, row };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const concurrent = await prisma.webhookEvent.findUnique({ where: { eventKey: key } });
    return { duplicate: Boolean(concurrent?.processedAt), row: concurrent };
  }
}

async function completeCommentEvent(event: InstagramCommentWebhookEvent, details: Record<string, unknown>) {
  await prisma.webhookEvent.update({
    where: { eventKey: commentEventKey(event.commentId) },
    data: {
      processedAt: new Date(),
      processingError: null,
      payload: toJson({ event, ...details, completedAt: new Date().toISOString() }),
    },
  });
}

async function failCommentEvent(event: InstagramCommentWebhookEvent, error: unknown) {
  const reason = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
  await prisma.webhookEvent.update({
    where: { eventKey: commentEventKey(event.commentId) },
    data: { processingError: reason },
  });
}

async function activeSuppression(event: InstagramCommentWebhookEvent, now: Date): Promise<boolean> {
  const workspace = await prisma.engageWorkspace.findUnique({
    where: { slug: "sikhadenge-default" },
    select: { id: true, isActive: true },
  });
  if (!workspace?.isActive) throw new Error("Default EngageOS workspace is unavailable for suppression checks.");

  const contact = event.commenterId
    ? await prisma.whatsAppContact.findUnique({
        where: { waId: `instagram:${event.commenterId}` },
        select: { id: true },
      })
    : null;
  const rows = await prisma.engageCustomerSuppression.findMany({
    where: {
      workspaceId: workspace.id,
      revokedAt: null,
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    take: 200,
  });
  return rows.some((row) => {
    const channelMatches = !row.channel || row.channel === "INSTAGRAM";
    const customerMatches = !row.customerRef || Boolean(contact?.id && row.customerRef === contact.id);
    return channelMatches && customerMatches;
  });
}

async function instagramIntegrationConnected(accountId: string): Promise<boolean> {
  const health = await listPersistedIntegrationHealth();
  return health.some(
    (item) =>
      item.channel === "INSTAGRAM" &&
      item.externalAccountId === accountId &&
      item.status === "CONNECTED",
  );
}

async function alreadySent(commentId: string, action: "PUBLIC_REPLY" | "PRIVATE_REPLY"): Promise<boolean> {
  const row = await prisma.webhookEvent.findUnique({ where: { eventKey: actionEventKey(commentId, action) } });
  return Boolean(row?.processedAt && !row.processingError);
}

async function reserveExternalAction(input: {
  event: InstagramCommentWebhookEvent;
  rule: InstagramCommentRule;
  action: "PUBLIC_REPLY" | "PRIVATE_REPLY";
}) {
  const key = actionEventKey(input.event.commentId, input.action);
  const existing = await prisma.webhookEvent.findUnique({ where: { eventKey: key } });
  if (existing?.processedAt && !existing.processingError) return "DONE" as const;
  if (existing && existing.processingError === "PENDING_EXTERNAL_WRITE") return "UNKNOWN_PENDING" as const;
  if (existing) {
    await prisma.webhookEvent.update({
      where: { eventKey: key },
      data: { processingError: "PENDING_EXTERNAL_WRITE", attemptCount: { increment: 1 } },
    });
    return "READY" as const;
  }
  try {
    await prisma.webhookEvent.create({
      data: {
        eventKey: key,
        eventType: `instagram.comment.${input.action.toLowerCase()}`,
        payload: toJson({
          commentId: input.event.commentId,
          mediaId: input.event.mediaId,
          ruleId: input.rule.id,
          action: input.action,
        }),
        attemptCount: 1,
        processingError: "PENDING_EXTERNAL_WRITE",
      },
    });
    return "READY" as const;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return "UNKNOWN_PENDING" as const;
  }
}

async function finishExternalAction(input: {
  event: InstagramCommentWebhookEvent;
  rule: InstagramCommentRule;
  action: "PUBLIC_REPLY" | "PRIVATE_REPLY";
  providerId?: string | null;
  recipientId?: string | null;
}) {
  const key = actionEventKey(input.event.commentId, input.action);
  await prisma.$transaction([
    prisma.webhookEvent.update({
      where: { eventKey: key },
      data: {
        processedAt: new Date(),
        processingError: null,
        payload: toJson({
          commentId: input.event.commentId,
          mediaId: input.event.mediaId,
          username: input.event.username,
          commenterId: input.event.commenterId,
          ruleId: input.rule.id,
          action: input.action,
          providerId: input.providerId ?? null,
          recipientId: input.recipientId ?? null,
          sentAt: new Date().toISOString(),
        }),
      },
    }),
    prisma.auditLog.create({
      data: {
        action: `INSTAGRAM_COMMENT_${input.action}_SENT`,
        entityType: "InstagramComment",
        entityId: input.event.commentId,
        after: toJson({
          mediaId: input.event.mediaId,
          ruleId: input.rule.id,
          providerId: input.providerId ?? null,
          recipientId: input.recipientId ?? null,
        }),
      },
    }),
  ]);
}

async function failExternalAction(
  event: InstagramCommentWebhookEvent,
  action: "PUBLIC_REPLY" | "PRIVATE_REPLY",
  error: unknown,
) {
  const reason = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
  const retryable = isRetriableInstagramError(error);
  await prisma.webhookEvent.update({
    where: { eventKey: actionEventKey(event.commentId, action) },
    data: {
      processingError: `${retryable ? "RETRYABLE" : "PERMANENT"}:${reason}`,
      processedAt: retryable ? null : new Date(),
    },
  });
  if (retryable) throw error;
  return reason;
}

async function createHumanReview(event: InstagramCommentWebhookEvent, rule: InstagramCommentRule | null, reason: string) {
  await prisma.auditLog.create({
    data: {
      action: "INSTAGRAM_COMMENT_HUMAN_REVIEW_REQUIRED",
      entityType: "InstagramComment",
      entityId: event.commentId,
      after: toJson({
        mediaId: event.mediaId,
        username: event.username,
        ruleId: rule?.id ?? null,
        reason,
      }),
    },
  });
}

async function executeLiveAction(input: {
  event: InstagramCommentWebhookEvent;
  rule: InstagramCommentRule;
  action: "PUBLIC_REPLY" | "PRIVATE_REPLY";
}): Promise<ActionOutcome> {
  const reservation = await reserveExternalAction(input);
  if (reservation === "DONE") return { action: input.action, status: "SKIPPED_ALREADY_SENT" };
  if (reservation === "UNKNOWN_PENDING") {
    await createHumanReview(input.event, input.rule, `${input.action} has an unresolved external-write reservation.`);
    return { action: input.action, status: "UNKNOWN_PENDING", reason: "External write outcome is unknown; automatic resend blocked." };
  }

  try {
    if (input.action === "PUBLIC_REPLY") {
      const sent = await sendInstagramPublicCommentReply({
        commentId: input.event.commentId,
        text: input.rule.publicReplyText ?? "",
      });
      await finishExternalAction({
        ...input,
        providerId: sent.replyId,
      });
      return { action: input.action, status: "SENT", providerId: sent.replyId };
    }

    const sent = await sendInstagramPrivateCommentReply({
      commentId: input.event.commentId,
      text: input.rule.privateReplyText ?? "",
    });
    await finishExternalAction({
      ...input,
      providerId: sent.messageId,
      recipientId: sent.recipientId,
    });
    return {
      action: input.action,
      status: "SENT",
      providerId: sent.messageId,
      recipientId: sent.recipientId,
    };
  } catch (error) {
    const reason = await failExternalAction(input.event, input.action, error);
    return { action: input.action, status: "FAILED_PERMANENT", reason };
  }
}

async function processComment(event: InstagramCommentWebhookEvent, env: Environment) {
  const reserved = await reserveCommentEvent(event);
  if (reserved.duplicate) return { duplicate: true, matched: false, review: false, outcomes: [] as ActionOutcome[] };

  try {
    const rules = parseInstagramCommentRulesJson(env.INSTAGRAM_COMMENT_RULES_JSON);
    const matches = matchingInstagramCommentRules(rules, event);
    if (matches.length === 0) {
      await completeCommentEvent(event, { outcome: "NO_RULE_MATCH" });
      return { duplicate: false, matched: false, review: false, outcomes: [] as ActionOutcome[] };
    }
    if (matches.length > 1) {
      await createHumanReview(event, null, `Multiple Instagram comment rules matched: ${matches.map((rule) => rule.id).join(", ")}`);
      await completeCommentEvent(event, { outcome: "AMBIGUOUS_RULE_MATCH", ruleIds: matches.map((rule) => rule.id) });
      return { duplicate: false, matched: true, review: true, outcomes: [] as ActionOutcome[] };
    }

    const rule = matches[0]!;
    const now = new Date();
    const suppressed = await activeSuppression(event, now);
    const connected = await instagramIntegrationConnected(event.accountId);
    const privateAlreadySent = await alreadySent(event.commentId, "PRIVATE_REPLY");
    const sensitive = instagramCommentIsSensitive(rule, event);
    const decision = evaluateInstagramCommentAutomation({
      commentId: event.commentId,
      commentCreatedAt: event.createdAt,
      now,
      privateReplyWindowMs: instagramPrivateReplyWindowMs(env),
      matchedRule: true,
      complaintOrSensitive: sensitive,
      suppressed,
      publicReplySupported: connected && Boolean(rule.publicReplyText),
      privateReplySupported:
        connected && event.field === "comments" && Boolean(rule.privateReplyText),
      initialPrivateReplyAlreadySent: privateAlreadySent,
    });

    if (decision.actions.includes("HUMAN_REVIEW")) {
      await createHumanReview(event, rule, decision.reason ?? "Sensitive or complaint comment requires review.");
      await completeCommentEvent(event, { outcome: "HUMAN_REVIEW", ruleId: rule.id, decision });
      return { duplicate: false, matched: true, review: true, outcomes: [] as ActionOutcome[] };
    }

    const mode = instagramCommentActionMode(env);
    if (mode !== "live") {
      const outcomes = decision.actions.map((action) => ({
        action: action as "PUBLIC_REPLY" | "PRIVATE_REPLY",
        status: "DRY_RUN" as const,
        reason: mode === "dry_run" ? "Dry-run mode; no external write sent." : "Comment actions are disabled.",
      }));
      await completeCommentEvent(event, {
        outcome: mode === "dry_run" ? "DRY_RUN" : "ACTION_DISABLED",
        ruleId: rule.id,
        connected,
        decision,
        outcomes,
      });
      return { duplicate: false, matched: true, review: false, outcomes };
    }

    const outcomes: ActionOutcome[] = [];
    for (const action of decision.actions) {
      if (action === "PUBLIC_REPLY" || action === "PRIVATE_REPLY") {
        outcomes.push(await executeLiveAction({ event, rule, action }));
      }
    }
    await completeCommentEvent(event, { outcome: "LIVE", ruleId: rule.id, decision, outcomes });
    return { duplicate: false, matched: true, review: false, outcomes };
  } catch (error) {
    await failCommentEvent(event, error).catch(() => undefined);
    throw error;
  }
}

export async function processInstagramCommentAutomation(
  payload: unknown,
  env: Environment = process.env,
): Promise<InstagramCommentAutomationResult> {
  if (!instagramCommentAutomationEnabled(env)) {
    return {
      enabled: false,
      commentsSeen: 0,
      processed: 0,
      duplicates: 0,
      matched: 0,
      humanReviews: 0,
      actionsSent: 0,
      dryRunActions: 0,
    };
  }

  const events = normalizeInstagramCommentWebhooks(payload);
  const result: InstagramCommentAutomationResult = {
    enabled: true,
    commentsSeen: events.length,
    processed: 0,
    duplicates: 0,
    matched: 0,
    humanReviews: 0,
    actionsSent: 0,
    dryRunActions: 0,
  };

  for (const event of events) {
    const processed = await processComment(event, env);
    if (processed.duplicate) result.duplicates += 1;
    else result.processed += 1;
    if (processed.matched) result.matched += 1;
    if (processed.review) result.humanReviews += 1;
    result.actionsSent += processed.outcomes.filter((item) => item.status === "SENT").length;
    result.dryRunActions += processed.outcomes.filter((item) => item.status === "DRY_RUN").length;
  }
  return result;
}
