import { Prisma } from "@prisma/client";

import { listAutomationFlowsForRuntime } from "@/lib/automation/automation-service";
import { prisma } from "@/lib/db/prisma";
import { enqueueWhatsAppAutomationEvent } from "@/modules/automations/application/whatsapp-automation-event-outbox";

const SCHEDULE_MAX_AUDIENCE = 100;

function clean(value: unknown, maximum = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function positiveMinutes(value: unknown, maximum: number): number | null {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= maximum
    ? Math.floor(minutes)
    : null;
}

function workspaceMetadataFilter(workspaceId: string) {
  return {
    path: ["engageos", "whatsappIdentity", "workspaceId"],
    equals: workspaceId,
  } as const;
}

function noReplyCursorEventKey(flowId: string, flowVersion: number) {
  return `automation-no-reply-cursor:${flowId}:${flowVersion}`;
}

async function readNoReplyCursor(flowId: string, flowVersion: number): Promise<string | null> {
  const row = await prisma.webhookEvent.findUnique({
    where: { eventKey: noReplyCursorEventKey(flowId, flowVersion) },
    select: { payload: true },
  });
  if (!row?.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return null;
  return clean((row.payload as Record<string, unknown>).cursorId, 120) || null;
}

async function writeNoReplyCursor(input: {
  flowId: string;
  flowVersion: number;
  cursorId: string | null;
  now: Date;
}) {
  const eventKey = noReplyCursorEventKey(input.flowId, input.flowVersion);
  const payload = {
    flowId: input.flowId,
    flowVersion: input.flowVersion,
    cursorId: input.cursorId,
    updatedAt: input.now.toISOString(),
  } as Prisma.InputJsonValue;

  await prisma.webhookEvent.upsert({
    where: { eventKey },
    update: { payload, processedAt: input.now },
    create: {
      eventKey,
      eventType: "automation_no_reply_cursor",
      payload,
      processedAt: input.now,
      attemptCount: 1,
    },
  });
}

async function materializeNoReply(input: {
  workspaceId: string;
  flowId: string;
  flowVersion: number;
  waitMinutes: number;
  now: Date;
  limit: number;
}) {
  const cutoff = new Date(input.now.getTime() - input.waitMinutes * 60_000);
  const storedCursor = await readNoReplyCursor(input.flowId, input.flowVersion);

  const loadPage = (cursorId: string | null) =>
    prisma.whatsAppConversation.findMany({
      where: {
        lastMessageAt: { lte: cutoff },
        ...(cursorId ? { id: { gt: cursorId } } : {}),
        contact: { metadata: workspaceMetadataFilter(input.workspaceId) },
      },
      orderBy: { id: "asc" },
      take: input.limit,
      select: {
        id: true,
        contactId: true,
        messages: {
          orderBy: [{ messageTimestamp: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
            direction: true,
            messageTimestamp: true,
          },
        },
      },
    });

  let conversations = await loadPage(storedCursor);
  if (conversations.length === 0 && storedCursor) {
    conversations = await loadPage(null);
  }

  let eligible = 0;
  let enqueued = 0;
  for (const conversation of conversations) {
    const latest = conversation.messages[0];
    if (!latest || latest.direction !== "OUTBOUND" || latest.messageTimestamp > cutoff) continue;
    eligible += 1;
    await prisma.$transaction((tx) =>
      enqueueWhatsAppAutomationEvent(tx, {
        workspaceId: input.workspaceId,
        sourceEventId: `no-reply:${input.flowId}:${input.flowVersion}:${conversation.id}:${latest.id}`,
        trigger: "NO_REPLY",
        conversationId: conversation.id,
        contactId: conversation.contactId,
        payload: {
          targetFlowId: input.flowId,
          targetFlowVersion: input.flowVersion,
          waitMinutes: input.waitMinutes,
          lastOutboundMessageId: latest.id,
          lastOutboundAt: latest.messageTimestamp.toISOString(),
        },
      }),
    );
    enqueued += 1;
  }

  const nextCursor =
    conversations.length === input.limit
      ? conversations.at(-1)?.id ?? null
      : null;
  await writeNoReplyCursor({
    flowId: input.flowId,
    flowVersion: input.flowVersion,
    cursorId: nextCursor,
    now: input.now,
  });

  return {
    inspected: conversations.length,
    eligible,
    enqueued,
    cursorAdvancedTo: nextCursor,
    wrapped: Boolean(storedCursor && conversations.length === 0),
  };
}

async function materializeSchedule(input: {
  workspaceId: string;
  flowId: string;
  flowVersion: number;
  intervalMinutes: number;
  tag: string;
  now: Date;
}) {
  const where = {
    contact: { metadata: workspaceMetadataFilter(input.workspaceId) },
    tags: { some: { tag: { name: input.tag } } },
  } as const;

  const audience = await prisma.whatsAppConversation.count({ where });
  if (audience === 0) return { audience, enqueued: 0, blocked: false };
  if (audience > SCHEDULE_MAX_AUDIENCE) {
    return { audience, enqueued: 0, blocked: true };
  }

  const bucket = Math.floor(input.now.getTime() / (input.intervalMinutes * 60_000));
  const conversations = await prisma.whatsAppConversation.findMany({
    where,
    orderBy: { id: "asc" },
    take: SCHEDULE_MAX_AUDIENCE,
    select: { id: true, contactId: true },
  });

  for (const conversation of conversations) {
    await prisma.$transaction((tx) =>
      enqueueWhatsAppAutomationEvent(tx, {
        workspaceId: input.workspaceId,
        sourceEventId: `schedule:${input.flowId}:${input.flowVersion}:${bucket}:${conversation.id}`,
        trigger: "SCHEDULE",
        conversationId: conversation.id,
        contactId: conversation.contactId,
        payload: {
          targetFlowId: input.flowId,
          targetFlowVersion: input.flowVersion,
          intervalMinutes: input.intervalMinutes,
          tag: input.tag,
          scheduleBucket: bucket,
        },
      }),
    );
  }
  return { audience, enqueued: conversations.length, blocked: false };
}

export async function materializeWhatsAppTimeTriggers(input: {
  now: Date;
  limit: number;
}) {
  const flows = (await listAutomationFlowsForRuntime()).filter((flow) => flow.status === "ACTIVE" && Boolean(flow.workspaceId));
  let noReplyFlows = 0;
  let noReplyEnqueued = 0;
  let scheduleFlows = 0;
  let scheduleEnqueued = 0;
  let scheduleBlocked = 0;

  for (const flow of flows) {
    const trigger = flow.nodes.find((node) => node.kind === "TRIGGER");
    if (!trigger || !flow.workspaceId) continue;

    if (trigger.type === "NO_REPLY") {
      const waitMinutes = positiveMinutes(trigger.config.waitMinutes, 43_200);
      if (!waitMinutes) continue;
      noReplyFlows += 1;
      const result = await materializeNoReply({
        workspaceId: flow.workspaceId,
        flowId: flow.flowId,
        flowVersion: flow.version,
        waitMinutes,
        now: input.now,
        limit: input.limit,
      });
      noReplyEnqueued += result.enqueued;
      continue;
    }

    if (trigger.type === "SCHEDULE") {
      const intervalMinutes = positiveMinutes(trigger.config.intervalMinutes, 10_080);
      const tag = clean(trigger.config.tag, 100);
      if (!intervalMinutes || !tag) continue;
      scheduleFlows += 1;
      const result = await materializeSchedule({
        workspaceId: flow.workspaceId,
        flowId: flow.flowId,
        flowVersion: flow.version,
        intervalMinutes,
        tag,
        now: input.now,
      });
      scheduleEnqueued += result.enqueued;
      if (result.blocked) scheduleBlocked += 1;
    }
  }

  return {
    noReplyFlows,
    noReplyEnqueued,
    scheduleFlows,
    scheduleEnqueued,
    scheduleBlocked,
    scheduleMaxAudience: SCHEDULE_MAX_AUDIENCE,
  };
}
