import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  facebookPageCommentActionMode,
  isRetriableFacebookPageCommentError,
  sendFacebookPagePublicCommentReply,
} from "@/lib/messenger/page-comment-api-client";
import {
  facebookPageCommentIsSensitive,
  matchingFacebookPageCommentRules,
  parseFacebookPageCommentRulesJson,
  type FacebookPageCommentRule,
} from "@/modules/channels/messenger/application/page-comment-rules";
import {
  normalizeFacebookPageCommentWebhooks,
  type FacebookPageCommentEvent,
} from "@/modules/channels/messenger/mapping/page-comment-webhook";
import { listPersistedIntegrationHealth } from "@/modules/integrations/infrastructure/prisma-integration-health";

type Environment = Readonly<Record<string, string | undefined>>;

export type FacebookPageCommentAutomationResult = {
  enabled: boolean;
  commentsSeen: number;
  processed: number;
  duplicates: number;
  matched: number;
  humanReviews: number;
  actionsSent: number;
  dryRunActions: number;
};

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function facebookPageCommentAutomationEnabled(
  env: Environment = process.env,
): boolean {
  return enabled(env.FACEBOOK_PAGE_COMMENT_AUTOMATION_ENABLED);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function commentEventKey(event: FacebookPageCommentEvent): string {
  return `facebook:page-comment:${event.pageId}:${event.commentId}`;
}

function actionEventKey(event: FacebookPageCommentEvent): string {
  return `facebook:page-comment-action:public-reply:${event.pageId}:${event.commentId}`;
}

async function reserveCommentEvent(event: FacebookPageCommentEvent) {
  const key = commentEventKey(event);
  const existing = await prisma.webhookEvent.findUnique({ where: { eventKey: key } });
  if (existing?.processedAt) return { duplicate: true };
  if (existing) {
    await prisma.webhookEvent.update({
      where: { eventKey: key },
      data: { attemptCount: { increment: 1 }, processingError: null },
    });
    return { duplicate: false };
  }
  try {
    await prisma.webhookEvent.create({
      data: {
        eventKey: key,
        eventType: "facebook.page_comment",
        payload: toJson({ event, receivedAt: new Date().toISOString() }),
        attemptCount: 1,
      },
    });
    return { duplicate: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const concurrent = await prisma.webhookEvent.findUnique({ where: { eventKey: key } });
    return { duplicate: Boolean(concurrent?.processedAt) };
  }
}

async function completeCommentEvent(
  event: FacebookPageCommentEvent,
  details: Record<string, unknown>,
) {
  await prisma.webhookEvent.update({
    where: { eventKey: commentEventKey(event) },
    data: {
      processedAt: new Date(),
      processingError: null,
      payload: toJson({ event, ...details, completedAt: new Date().toISOString() }),
    },
  });
}

async function failCommentEvent(event: FacebookPageCommentEvent, error: unknown) {
  const reason = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
  await prisma.webhookEvent.update({
    where: { eventKey: commentEventKey(event) },
    data: { processingError: reason },
  });
}

async function humanReview(
  event: FacebookPageCommentEvent,
  reason: string,
  ruleId?: string,
) {
  await prisma.auditLog.create({
    data: {
      action: "FACEBOOK_PAGE_COMMENT_HUMAN_REVIEW",
      entityType: "FacebookPageComment",
      entityId: event.commentId,
      after: toJson({
        pageId: event.pageId,
        postId: event.postId,
        senderId: event.senderId,
        ruleId: ruleId ?? null,
        reason: reason.slice(0, 500),
      }),
    },
  });
}

async function activeSuppression(event: FacebookPageCommentEvent, now: Date): Promise<boolean> {
  const workspace = await prisma.engageWorkspace.findUnique({
    where: { slug: "sikhadenge-default" },
    select: { id: true, isActive: true },
  });
  if (!workspace?.isActive) throw new Error("Default EngageOS workspace is unavailable for suppression checks.");

  const contact = event.senderId
    ? await prisma.whatsAppContact.findUnique({
        where: { waId: `messenger:${event.senderId}` },
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
    const channelMatches = !row.channel || row.channel === "MESSENGER";
    const customerMatches = !row.customerRef || Boolean(contact?.id && row.customerRef === contact.id);
    return channelMatches && customerMatches;
  });
}

async function pageIntegrationConnected(pageId: string): Promise<boolean> {
  const health = await listPersistedIntegrationHealth();
  return health.some(
    (item) =>
      item.channel === "MESSENGER" &&
      item.externalAccountId === pageId &&
      item.status === "CONNECTED",
  );
}

async function reserveExternalAction(event: FacebookPageCommentEvent, rule: FacebookPageCommentRule) {
  const key = actionEventKey(event);
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
        eventType: "facebook.page_comment.public_reply",
        payload: toJson({ pageId: event.pageId, postId: event.postId, commentId: event.commentId, ruleId: rule.id }),
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

async function finishExternalAction(
  event: FacebookPageCommentEvent,
  rule: FacebookPageCommentRule,
  replyCommentId: string | null,
) {
  await prisma.$transaction([
    prisma.webhookEvent.update({
      where: { eventKey: actionEventKey(event) },
      data: {
        processedAt: new Date(),
        processingError: null,
        payload: toJson({
          pageId: event.pageId,
          postId: event.postId,
          commentId: event.commentId,
          ruleId: rule.id,
          replyCommentId,
          sentAt: new Date().toISOString(),
        }),
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "FACEBOOK_PAGE_COMMENT_PUBLIC_REPLY_SENT",
        entityType: "FacebookPageComment",
        entityId: event.commentId,
        after: toJson({ pageId: event.pageId, postId: event.postId, ruleId: rule.id, replyCommentId }),
      },
    }),
  ]);
}

async function failExternalAction(event: FacebookPageCommentEvent, error: unknown) {
  const reason = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
  const retryable = isRetriableFacebookPageCommentError(error);
  await prisma.webhookEvent.update({
    where: { eventKey: actionEventKey(event) },
    data: {
      processingError: `${retryable ? "RETRYABLE" : "PERMANENT"}:${reason}`,
      processedAt: retryable ? null : new Date(),
    },
  });
  if (retryable) throw error;
  return reason;
}

export async function processFacebookPageCommentAutomation(
  payload: unknown,
  env: Environment = process.env,
): Promise<FacebookPageCommentAutomationResult> {
  const events = normalizeFacebookPageCommentWebhooks(payload);
  const summary: FacebookPageCommentAutomationResult = {
    enabled: facebookPageCommentAutomationEnabled(env),
    commentsSeen: events.length,
    processed: 0,
    duplicates: 0,
    matched: 0,
    humanReviews: 0,
    actionsSent: 0,
    dryRunActions: 0,
  };
  if (!summary.enabled || events.length === 0) return summary;

  const rules = parseFacebookPageCommentRulesJson(env.FACEBOOK_PAGE_COMMENT_RULES_JSON);
  const mode = facebookPageCommentActionMode(env);

  for (const event of events) {
    const reservation = await reserveCommentEvent(event);
    if (reservation.duplicate) {
      summary.duplicates += 1;
      continue;
    }

    try {
      if (event.verb !== "ADD") {
        await completeCommentEvent(event, { outcome: "IGNORED_NON_ADD" });
        summary.processed += 1;
        continue;
      }
      if (event.senderId && event.senderId === event.pageId) {
        await completeCommentEvent(event, { outcome: "IGNORED_PAGE_SELF_COMMENT" });
        summary.processed += 1;
        continue;
      }

      const matches = matchingFacebookPageCommentRules({
        postId: event.postId,
        message: event.message,
        rules,
      });
      if (matches.length === 0) {
        await completeCommentEvent(event, { outcome: "NO_RULE_MATCH" });
        summary.processed += 1;
        continue;
      }
      summary.matched += 1;

      if (matches.length > 1) {
        await humanReview(event, "Multiple Facebook Page comment rules matched; automatic selection is blocked.");
        await completeCommentEvent(event, { outcome: "HUMAN_REVIEW_MULTIPLE_RULES", ruleIds: matches.map((rule) => rule.id) });
        summary.humanReviews += 1;
        summary.processed += 1;
        continue;
      }

      const rule = matches[0]!;
      if (facebookPageCommentIsSensitive(event.message, rule)) {
        await humanReview(event, "Sensitive or complaint keyword matched.", rule.id);
        await completeCommentEvent(event, { outcome: "HUMAN_REVIEW_SENSITIVE", ruleId: rule.id });
        summary.humanReviews += 1;
        summary.processed += 1;
        continue;
      }
      if (await activeSuppression(event, new Date())) {
        await completeCommentEvent(event, { outcome: "SUPPRESSED", ruleId: rule.id });
        summary.processed += 1;
        continue;
      }
      if (!rule.publicReplyText) {
        await completeCommentEvent(event, { outcome: "MATCHED_NO_PUBLIC_REPLY", ruleId: rule.id });
        summary.processed += 1;
        continue;
      }
      if (mode === "disabled") {
        await completeCommentEvent(event, { outcome: "ACTIONS_DISABLED", ruleId: rule.id });
        summary.processed += 1;
        continue;
      }
      if (mode === "dry_run") {
        await completeCommentEvent(event, { outcome: "DRY_RUN_PUBLIC_REPLY", ruleId: rule.id, plannedText: rule.publicReplyText });
        summary.dryRunActions += 1;
        summary.processed += 1;
        continue;
      }
      if (!(await pageIntegrationConnected(event.pageId))) {
        await humanReview(event, "Facebook Page integration is not CONNECTED with API, permission and webhook evidence.", rule.id);
        await completeCommentEvent(event, { outcome: "HUMAN_REVIEW_INTEGRATION_NOT_CONNECTED", ruleId: rule.id });
        summary.humanReviews += 1;
        summary.processed += 1;
        continue;
      }

      const actionReservation = await reserveExternalAction(event, rule);
      if (actionReservation === "DONE") {
        await completeCommentEvent(event, { outcome: "PUBLIC_REPLY_ALREADY_SENT", ruleId: rule.id });
        summary.processed += 1;
        continue;
      }
      if (actionReservation === "UNKNOWN_PENDING") {
        await humanReview(event, "A previous public-reply attempt has unknown external-write state; automatic resend is blocked.", rule.id);
        await completeCommentEvent(event, { outcome: "HUMAN_REVIEW_UNKNOWN_EXTERNAL_WRITE", ruleId: rule.id });
        summary.humanReviews += 1;
        summary.processed += 1;
        continue;
      }

      try {
        const sent = await sendFacebookPagePublicCommentReply({
          commentId: event.commentId,
          message: rule.publicReplyText,
          env,
        });
        await finishExternalAction(event, rule, sent.replyCommentId);
        await completeCommentEvent(event, { outcome: "PUBLIC_REPLY_SENT", ruleId: rule.id, replyCommentId: sent.replyCommentId });
        summary.actionsSent += 1;
        summary.processed += 1;
      } catch (error) {
        const permanentReason = await failExternalAction(event, error);
        if (permanentReason) {
          await humanReview(event, `Permanent Page comment reply failure: ${permanentReason}`, rule.id);
          await completeCommentEvent(event, { outcome: "HUMAN_REVIEW_PERMANENT_FAILURE", ruleId: rule.id, reason: permanentReason });
          summary.humanReviews += 1;
          summary.processed += 1;
        }
      }
    } catch (error) {
      await failCommentEvent(event, error).catch(() => undefined);
      throw error;
    }
  }

  return summary;
}
