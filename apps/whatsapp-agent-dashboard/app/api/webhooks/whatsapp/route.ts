import { NextResponse } from "next/server";

import { processWebhookAgentBridge } from "../../../../lib/agent/webhook-agent-bridge";
import { mirrorMetaWebhookToCanonical } from "../../../../lib/meta/canonical-mirror";
import {
  getWhatsAppAppSecret,
  getWhatsAppVerifyToken,
  getWhatsAppWebhookMaxBytes,
} from "../../../../lib/meta/config";
import {
  assertEventRuntimeConfiguration,
  engageOsEventRuntimeEnabled,
  enqueueWhatsAppWebhookDurably,
} from "../../../../lib/meta/durable-webhook-runtime";
import { verifyMetaSignature } from "../../../../lib/meta/signature";
import { processWhatsAppWebhook } from "../../../../lib/meta/webhook-processor";
import {
  releasePersistedWebhookReplay,
  reservePersistedWebhookReplay,
} from "@/modules/channels/core/security/prisma-webhook-replay";
import { createPrismaEventRuntimePersistence } from "@/modules/events/infrastructure/prisma-event-runtime";
import { RedisEventQueue } from "@/modules/events/infrastructure/redis-event-queue";
import {
  createNodeRedisTransportFromEnv,
  type NodeRedisCommandTransport,
} from "@/modules/events/infrastructure/node-redis-transport";
import { recordMetaWebhookEvidence } from "@/modules/integrations/infrastructure/prisma-integration-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

let eventRedis: NodeRedisCommandTransport | null = null;

async function eventRuntimeDependencies() {
  assertEventRuntimeConfiguration();
  eventRedis ??= createNodeRedisTransportFromEnv();
  if (!(await eventRedis.ping())) throw new Error("Redis event queue health check failed.");
  const persistence = createPrismaEventRuntimePersistence();
  return {
    store: persistence.store,
    queue: new RedisEventQueue(eventRedis),
  };
}

async function recordSignedWebhookEvidence(): Promise<void> {
  const externalAccountId =
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!externalAccountId) return;
  await recordMetaWebhookEvidence({
    channel: "WHATSAPP",
    externalAccountId,
  }).catch(() => undefined);
}

function mirrorAcceptedWebhook(input: {
  rawBody: string;
  signatureHeader: string | null;
}): void {
  // Transitional convergence path: Meta remains pointed at this production
  // callback. Only after the existing local persistence/queue accepts the
  // signed webhook do we optionally mirror the exact signed envelope to the
  // canonical SikhaDenge dashboard. The feature is OFF by default and mirror
  // failure never changes the primary Meta acknowledgement.
  void mirrorMetaWebhookToCanonical(input)
    .then((mirror) => {
      if (mirror.attempted && !mirror.delivered) {
        console.warn(
          `[whatsapp-canonical-mirror] delivery failed status=${mirror.status ?? "none"} reason=${mirror.reason}`,
        );
      }
    })
    .catch(() => {
      // Best-effort only during the controlled SA1 convergence canary.
    });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  let expectedToken: string;
  try {
    expectedToken = getWhatsAppVerifyToken();
  } catch {
    return NextResponse.json(
      { error: "Webhook verification is not configured." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  if (mode !== "subscribe" || !challenge || token !== expectedToken) {
    return NextResponse.json(
      { error: "Webhook verification failed." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > getWhatsAppWebhookMaxBytes()) {
    return NextResponse.json(
      { error: "Webhook payload is too large." },
      { status: 413, headers: NO_STORE_HEADERS },
    );
  }

  let appSecret: string;
  try {
    appSecret = getWhatsAppAppSecret();
  } catch {
    return NextResponse.json(
      { error: "Webhook signature verification is not configured." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const signatureHeader = request.headers.get("x-hub-signature-256");
  const signatureIsValid = verifyMetaSignature({
    rawBody,
    signatureHeader,
    appSecret,
  });
  if (!signatureIsValid) {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json(
      { error: "Webhook payload is not valid JSON." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  await recordSignedWebhookEvidence();

  let replay: Awaited<ReturnType<typeof reservePersistedWebhookReplay>>;
  try {
    replay = await reservePersistedWebhookReplay({
      channel: "WHATSAPP",
      rawBody,
      signatureHeader,
    });
  } catch {
    return NextResponse.json(
      { error: "Webhook replay protection is unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  if (replay.duplicate) {
    return NextResponse.json(
      { received: true, duplicate: true },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  if (engageOsEventRuntimeEnabled()) {
    try {
      const dependencies = await eventRuntimeDependencies();
      const accepted = await enqueueWhatsAppWebhookDurably({
        payload,
        rawBody,
        ...dependencies,
      });

      mirrorAcceptedWebhook({ rawBody, signatureHeader });

      return NextResponse.json(
        {
          received: true,
          queued: true,
          duplicate: accepted.duplicate,
          eventId: accepted.event.id,
          correlationId: accepted.event.correlationId,
        },
        { status: 200, headers: NO_STORE_HEADERS },
      );
    } catch {
      await releasePersistedWebhookReplay(replay).catch(() => undefined);
      return NextResponse.json(
        { error: "Durable webhook queue is unavailable; the provider may retry." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
  }

  try {
    const result = await processWhatsAppWebhook(payload, rawBody);

    mirrorAcceptedWebhook({ rawBody, signatureHeader });

    let agent: Awaited<ReturnType<typeof processWebhookAgentBridge>> | null = null;
    try {
      agent = await processWebhookAgentBridge(payload);
    } catch {
      agent = {
        matched: 0,
        analyzed: 0,
        queued: 0,
        sent: 0,
        handoffs: 0,
        skipped: 0,
        failed: 1,
      };
    }
    return NextResponse.json(
      { received: true, ...result, agent },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch {
    await releasePersistedWebhookReplay(replay).catch(() => undefined);
    return NextResponse.json(
      { error: "Webhook processing failed and can be retried." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
