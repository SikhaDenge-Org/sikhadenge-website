import { MessageActor, TemplateStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { queueOutboundMessage } from "@/lib/outbound/outbound-service";

const WORKSPACE_ID = "engagews_default";
const CANARY_TAG = "CANARY_INTERNAL_TEST";
const IDEMPOTENCY_PREFIX = "phase17-w5-internal-canary";

function required(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function mode(): "DRY_RUN" | "PROVISION" {
  const value = (process.env.W5_MODE ?? "DRY_RUN").trim().toUpperCase();
  if (value === "DRY_RUN" || value === "PROVISION") return value;
  throw new Error("W5_MODE must be DRY_RUN or PROVISION.");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasTemplateVariables(value: unknown): boolean {
  if (typeof value === "string") return /{{\s*\d+\s*}}/.test(value);
  if (Array.isArray(value)) return value.some(hasTemplateVariables);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasTemplateVariables);
  }
  return false;
}

async function main() {
  const action = mode();
  const waId = required("W5_VERIFIED_CANARY_WA_ID");
  const templateName = required("W5_TEMPLATE_NAME");
  if (!/^\d{6,20}$/.test(waId)) throw new Error("Verified canary waId is malformed.");
  if (!/^[a-z0-9_]{1,512}$/.test(templateName)) throw new Error("Template name is malformed.");

  const contact = await prisma.whatsAppContact.findUnique({
    where: { waId },
    select: {
      consentStatus: true,
      optedOutAt: true,
      metadata: true,
      conversations: {
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          source: true,
          tags: { select: { tag: { select: { name: true } } } },
        },
      },
    },
  });
  if (!contact) throw new Error("Verified internal canary contact was not found.");

  const engageos = record(record(contact.metadata).engageos);
  const identity = record(engageos.whatsappIdentity);
  const canary = record(engageos.canary);
  if (
    identity.workspaceId !== WORKSPACE_ID ||
    canary.designated !== true ||
    canary.kind !== "INTERNAL_TEST"
  ) {
    throw new Error("Verified contact is not the designated internal canary.");
  }
  if (contact.consentStatus !== "OPTED_IN") throw new Error("Verified canary is not opted in.");
  if (contact.optedOutAt) throw new Error("Verified canary is opted out.");

  const conversation =
    contact.conversations.find((item) => {
      const source = item.source?.trim().toLowerCase() || "whatsapp";
      return source === "whatsapp" && item.tags.some((link) => link.tag.name === CANARY_TAG);
    }) ?? null;
  if (!conversation) throw new Error("Designated internal canary conversation is missing.");

  const template = await prisma.whatsAppTemplate.findUnique({
    where: { name: templateName },
    select: {
      id: true,
      name: true,
      status: true,
      components: true,
    },
  });
  if (!template || template.status !== TemplateStatus.APPROVED) {
    throw new Error("Selected template is not approved.");
  }
  if (hasTemplateVariables(template.components)) {
    throw new Error("Selected template must have zero variables for W5.");
  }

  const launch = await prisma.engageControlledLaunchState.findUnique({
    where: { workspaceId: WORKSPACE_ID },
    select: { externalWritesAllowed: true },
  });
  if (!launch) throw new Error("Controlled-launch state is missing.");
  if (launch.externalWritesAllowed) throw new Error("Controlled-launch external writes must remain disabled.");

  console.log("W5_TARGET_READY=true");
  console.log("W5_TEMPLATE_READY=true");
  console.log("W5_EXTERNAL_WRITES_ALLOWED=false");
  console.log("W5_IDENTIFIER_EMITTED=false");

  if (action === "DRY_RUN") {
    console.log("W5_DRY_RUN=PASS");
    console.log("W5_DATABASE_WRITE_REQUESTED=false");
    console.log("W5_PROVIDER_WRITE_REQUESTED=false");
    console.log("W5_EXTERNAL_WHATSAPP_WRITE_SENT=false");
    return;
  }

  const confirmation = required("W5_CONFIRM");
  if (confirmation !== "PROVISION_ONE_W5_INTERNAL_CANARY_QUEUE") {
    throw new Error("Explicit W5 provisioning confirmation is missing.");
  }

  const idempotencyKey = `${IDEMPOTENCY_PREFIX}:${conversation.id}:${template.id}:v1`;
  const queued = await queueOutboundMessage({
    conversationId: conversation.id,
    actor: MessageActor.COUNSELOR,
    sentById: null,
    content: {
      kind: "template",
      templateId: template.id,
      components: [],
    },
    idempotencyKey,
  });

  if (queued.duplicate || !queued.message?.id) {
    const existing = await prisma.whatsAppMessage.findFirst({
      where: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        rawPayload: {
          path: ["outbound", "idempotencyKey"],
          equals: idempotencyKey,
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        metaMessageId: true,
      },
    });
    if (!existing) throw new Error("Idempotent W5 queue record could not be resolved.");
    if (existing.status !== "QUEUED") throw new Error("Existing W5 canary record is not QUEUED.");
    if (existing.metaMessageId) throw new Error("Existing W5 canary record already has a Meta message ID.");
    console.log("W5_QUEUE_PROVISIONED=false");
    console.log("W5_QUEUE_DUPLICATE=true");
  } else {
    if (queued.message.status !== "QUEUED") throw new Error("New W5 canary record is not QUEUED.");
    console.log("W5_QUEUE_PROVISIONED=true");
    console.log("W5_QUEUE_DUPLICATE=false");
  }

  console.log("W5_QUEUE_STATUS=QUEUED");
  console.log("W5_QUEUE_META_MESSAGE_ID_SET=false");
  console.log("W5_PROVIDER_WRITE_REQUESTED=false");
  console.log("W5_EXTERNAL_WHATSAPP_WRITE_SENT=false");
  console.log("W5_QUEUE_PROVISION=PASS");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
