import { MessageActor, TemplateStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { queueOutboundMessage } from "@/lib/outbound/outbound-service";

const WORKSPACE_ID = "engagews_default";
const CANARY_TAG = "CANARY_INTERNAL_TEST";

function required(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function mode(): "DRY_RUN" | "PROVISION" {
  const value = (process.env.PHASE22D_MODE ?? "DRY_RUN").trim().toUpperCase();
  if (value === "DRY_RUN" || value === "PROVISION") return value;
  throw new Error("PHASE22D_MODE must be DRY_RUN or PROVISION.");
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
  const waId = required("PHASE22D_VERIFIED_CANARY_WA_ID");
  if (!/^\d{6,20}$/.test(waId)) throw new Error("Verified canary waId is malformed.");

  const contact = await prisma.whatsAppContact.findUnique({
    where: { waId },
    select: {
      id: true,
      consentStatus: true,
      optedOutAt: true,
      metadata: true,
      conversations: {
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          source: true,
          status: true,
          agentMode: true,
          serviceWindowExpiresAt: true,
          tags: { select: { tag: { select: { name: true } } } },
        },
      },
    },
  });
  if (!contact) throw new Error("Verified canary contact was not found.");

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
  if (contact.optedOutAt) throw new Error("Verified canary is opted out.");

  const conversation =
    contact.conversations.find((item) => {
      const source = item.source?.trim().toLowerCase() || "whatsapp";
      return source === "whatsapp" && item.tags.some((link) => link.tag.name === CANARY_TAG);
    }) ?? null;
  if (!conversation) throw new Error("Designated canary WhatsApp conversation is missing.");

  const templates = await prisma.whatsAppTemplate.findMany({
    where: { status: TemplateStatus.APPROVED },
    orderBy: [{ name: "asc" }, { language: "asc" }],
    select: { id: true, name: true, language: true, category: true, components: true },
  });
  const zeroVariableTemplates = templates.filter((template) => !hasTemplateVariables(template.components));

  const admins = await prisma.engageWorkspaceMembership.findMany({
    where: {
      workspaceId: WORKSPACE_ID,
      isActive: true,
      role: "ADMIN",
      user: { isActive: true },
    },
    orderBy: [{ createdAt: "asc" }],
    select: { userId: true, role: true },
  });

  const state = await prisma.engageControlledLaunchState.findUnique({
    where: { workspaceId: WORKSPACE_ID },
    select: { version: true, stage: true, mode: true, writePolicy: true, externalWritesAllowed: true },
  });
  if (!state) throw new Error("Controlled-launch state is missing.");

  const inventory = {
    mode: action,
    workspaceId: WORKSPACE_ID,
    canaryConversationId: conversation.id,
    canaryConsentStatus: contact.consentStatus,
    serviceWindowOpen: Boolean(
      conversation.serviceWindowExpiresAt &&
      conversation.serviceWindowExpiresAt.getTime() > Date.now(),
    ),
    controlledLaunch: state,
    approvedTemplateCandidates: zeroVariableTemplates.map((template) => ({
      name: template.name,
      language: template.language,
      category: template.category,
    })),
    approvedTemplateCandidateCount: zeroVariableTemplates.length,
    activeAdminCount: admins.length,
    selectedAdminUserId: admins.length === 1 ? admins[0]!.userId : null,
    externalWhatsAppWriteSent: false,
  };

  if (action === "DRY_RUN") {
    console.log(JSON.stringify(inventory, null, 2));
    return;
  }

  const templateName = required("PHASE22D_TEMPLATE_NAME");
  const confirmation = required("PHASE22D_CONFIRM");
  if (confirmation !== "PROVISION_ONE_INTERNAL_CANARY_MESSAGE") {
    throw new Error("Explicit Phase22D provisioning confirmation is missing.");
  }

  const template = zeroVariableTemplates.find((item) => item.name === templateName);
  if (!template) throw new Error("Requested template is not an approved zero-variable template.");

  const idempotencyKey = `phase22d-internal-canary:${waId}:${template.id}:v1`;
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
      select: { id: true, status: true },
    });
    if (!existing) throw new Error("Idempotent canary message exists but could not be resolved.");
    console.log(JSON.stringify({
      ...inventory,
      provisioned: false,
      duplicate: true,
      messageId: existing.id,
      messageStatus: existing.status,
      templateName: template.name,
      idempotencyKey,
      externalWhatsAppWriteSent: false,
    }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    ...inventory,
    provisioned: true,
    duplicate: false,
    messageId: queued.message.id,
    messageStatus: queued.message.status,
    templateName: template.name,
    idempotencyKey,
    externalWhatsAppWriteSent: false,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
