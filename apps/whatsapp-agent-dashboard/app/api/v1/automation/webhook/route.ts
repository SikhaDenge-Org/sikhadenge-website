import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { listAutomationFlowsForWorkspace } from "@/lib/automation/automation-service";
import { prisma } from "@/lib/db/prisma";
import { enqueueWhatsAppAutomationEvent } from "@/modules/automations/application/whatsapp-automation-event-outbox";
import { authenticatePublicApiKey } from "@/modules/saas/application/public-api-key-service";
import { buildWorkspaceBillingProjection } from "@/modules/saas/application/workspace-billing";
import { prismaPublicApiKeyRepository } from "@/modules/saas/infrastructure/prisma-public-api-key-repository";
import { prismaSaasBillingRepository } from "@/modules/saas/infrastructure/prisma-saas-billing-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, maximum = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization")?.trim() || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function denialStatus(reason: string): number {
  if (reason === "rate-limit-exceeded") return 429;
  if (
    reason === "tenant-scope-mismatch" ||
    reason === "scope-denied" ||
    reason === "public-api-disabled" ||
    reason === "plan-limit-exceeded"
  ) return 403;
  return 401;
}

function workspaceMetadataFilter(workspaceId: string) {
  return {
    path: ["engageos", "whatsappIdentity", "workspaceId"],
    equals: workspaceId,
  } as const;
}

export async function POST(request: Request) {
  const workspaceId = request.headers.get("x-workspace-id")?.trim() || "";
  if (!workspaceId) {
    return NextResponse.json({ error: "x-workspace-id is required." }, { status: 400 });
  }

  const secret = bearer(request);
  if (!secret) {
    return NextResponse.json({ error: "Bearer API key is required." }, { status: 401 });
  }

  const idempotencyKey = request.headers.get("x-idempotency-key")?.trim().slice(0, 200) || "";
  if (!idempotencyKey) {
    return NextResponse.json({ error: "x-idempotency-key is required." }, { status: 400 });
  }

  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();

  try {
    const projection = await buildWorkspaceBillingProjection(prismaSaasBillingRepository, {
      activeWorkspaceId: workspaceId,
      workspaceId,
    });

    const auth = await authenticatePublicApiKey(prismaPublicApiKeyRepository, {
      secret,
      activeWorkspaceId: workspaceId,
      resourceWorkspaceId: workspaceId,
      requiredScope: "automations.trigger",
      limits: projection.plan.limits,
      projectedUsage: projection.usage,
      windowLimit: Math.max(1, Number(process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE) || 120),
      windowMs: 60_000,
      requestId,
      method: "POST",
      path: "/api/v1/automation/webhook",
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: request.headers.get("user-agent"),
    });

    if (!auth.allowed) {
      return NextResponse.json(
        { error: "Public API access denied.", reason: auth.reason, requestId },
        { status: denialStatus(auth.reason), headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = record(await request.json());
    const flowId = clean(body.flowId, 120);
    const conversationId = clean(body.conversationId, 120);
    const contactId = clean(body.contactId, 120);
    const label = clean(body.label, 120);
    const payload = record(body.payload);

    if (!flowId) {
      return NextResponse.json({ error: "flowId is required.", requestId }, { status: 400 });
    }
    if (!conversationId && !contactId) {
      return NextResponse.json(
        { error: "conversationId or contactId is required.", requestId },
        { status: 400 },
      );
    }

    const flow = (await listAutomationFlowsForWorkspace(workspaceId, false)).find(
      (item) => item.flowId === flowId,
    );
    if (!flow || flow.status !== "ACTIVE") {
      return NextResponse.json({ error: "Active automation flow not found.", requestId }, { status: 404 });
    }

    const trigger = flow.nodes.find((node) => node.kind === "TRIGGER");
    if (!trigger || trigger.type !== "WEBHOOK") {
      return NextResponse.json(
        { error: "Target flow is not an active WEBHOOK automation.", requestId },
        { status: 409 },
      );
    }

    const expectedLabel = clean(trigger.config.secretLabel, 120);
    if (!expectedLabel || label !== expectedLabel) {
      return NextResponse.json({ error: "Webhook event label mismatch.", requestId }, { status: 403 });
    }

    let resolvedConversationId = conversationId;
    let resolvedContactId = contactId;

    if (conversationId) {
      const conversation = await prisma.whatsAppConversation.findFirst({
        where: {
          id: conversationId,
          contact: { metadata: workspaceMetadataFilter(workspaceId) },
        },
        select: { id: true, contactId: true },
      });
      if (!conversation || (contactId && conversation.contactId !== contactId)) {
        return NextResponse.json({ error: "Conversation is outside the workspace.", requestId }, { status: 404 });
      }
      resolvedContactId = conversation.contactId;
    } else {
      const contact = await prisma.whatsAppContact.findFirst({
        where: { id: contactId, metadata: workspaceMetadataFilter(workspaceId) },
        select: { id: true },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact is outside the workspace.", requestId }, { status: 404 });
      }
      const conversation = await prisma.whatsAppConversation.findFirst({
        where: { contactId: contact.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      resolvedContactId = contact.id;
      resolvedConversationId = conversation?.id ?? "";
    }

    const queued = await prisma.$transaction(async (tx) => {
      const event = await enqueueWhatsAppAutomationEvent(tx, {
        workspaceId,
        sourceEventId: `public-webhook:${flow.flowId}:${idempotencyKey}`,
        trigger: "WEBHOOK",
        conversationId: resolvedConversationId || null,
        contactId: resolvedContactId || null,
        payload: {
          ...payload,
          targetFlowId: flow.flowId,
          targetFlowVersion: flow.version,
          webhookLabel: label,
          requestId,
          idempotencyKey,
          apiKeyId: auth.apiKey.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: null,
          action: "WHATSAPP_AUTOMATION_WEBHOOK_QUEUED",
          entityType: "AutomationFlow",
          entityId: flow.flowId,
          after: {
            workspaceId,
            eventId: event.id,
            requestId,
            idempotencyKey,
            conversationId: resolvedConversationId || null,
            contactId: resolvedContactId || null,
          },
        },
      });
      return event;
    });

    return NextResponse.json(
      {
        accepted: true,
        eventId: queued.id,
        eventKey: queued.eventKey,
        flowId: flow.flowId,
        flowVersion: flow.version,
        requestId,
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Automation webhook ingestion failed.",
        requestId,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
