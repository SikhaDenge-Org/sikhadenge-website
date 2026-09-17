import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  buildLegacyWhatsAppIdentityMapping,
  mergeLegacyWhatsAppMappingMetadata,
  readLegacyWhatsAppMappingMetadata,
} from "@/modules/channels/whatsapp/application/legacy-identity-mapping";
import { DEFAULT_ENGAGE_WORKSPACE_ID } from "@/modules/channels/whatsapp/application/provider-connection-binding";

const APPLY =
  process.env.ENGAGEOS_WHATSAPP_PROVIDER_BINDING_RECONCILE_MODE?.trim().toUpperCase() ===
  "APPLY";

function whatsappSourceWhere() {
  return {
    OR: [
      { source: null },
      { source: { notIn: ["instagram", "messenger"] } },
    ],
  };
}

function phoneNumberId(): string {
  const value =
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!value) throw new Error("WHATSAPP_PHONE_NUMBER_ID is required.");
  return value;
}

function assertApplySafety(): void {
  if (!APPLY) return;

  const outboundMode = process.env.WHATSAPP_OUTBOUND_MODE?.trim().toLowerCase() || "disabled";
  const cutover = process.env.WHATSAPP_CUTOVER_APPROVED?.trim().toLowerCase() || "false";
  const liveAck = process.env.WHATSAPP_OUTBOUND_LIVE_ACK?.trim() || "";
  const killSwitch = process.env.WHATSAPP_OUTBOUND_KILL_SWITCH?.trim().toLowerCase() || "on";

  if (outboundMode === "live") {
    throw new Error("Refusing reconciliation while WHATSAPP_OUTBOUND_MODE=live.");
  }
  if (cutover === "true") {
    throw new Error("Refusing reconciliation while WHATSAPP_CUTOVER_APPROVED=true.");
  }
  if (liveAck) {
    throw new Error("Refusing reconciliation while WHATSAPP_OUTBOUND_LIVE_ACK is set.");
  }
  if (killSwitch !== "on") {
    throw new Error("Refusing reconciliation unless WHATSAPP_OUTBOUND_KILL_SWITCH=on.");
  }
}

async function activeConnectionId(phoneId: string): Promise<string> {
  const matches = await prisma.engageChannelConnection.findMany({
    where: {
      workspaceId: DEFAULT_ENGAGE_WORKSPACE_ID,
      channel: "WHATSAPP",
      externalAccountId: phoneId,
      status: { in: ["CONNECTED", "DEGRADED"] },
    },
    select: { id: true },
    take: 2,
  });
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one active WhatsApp connection for the configured phone number, found ${matches.length}.`,
    );
  }
  return matches[0].id;
}

function needsRefresh(input: {
  contactId: string;
  waId: string;
  metadata: Prisma.JsonValue | null;
  connectionId: string;
}): { needsWrite: boolean; metadata: Prisma.InputJsonValue } {
  const next = buildLegacyWhatsAppIdentityMapping({
    workspaceId: DEFAULT_ENGAGE_WORKSPACE_ID,
    connectionId: input.connectionId,
    legacyContactId: input.contactId,
    waId: input.waId,
  });
  const existing = readLegacyWhatsAppMappingMetadata(input.metadata);
  const needsWrite =
    !existing ||
    existing.workspaceId !== next.workspaceId ||
    existing.connectionId !== next.connectionId ||
    existing.legacyContactId !== next.legacyContactId ||
    existing.externalUserId !== next.externalUserId ||
    existing.customerRef !== next.customerRef ||
    existing.identityRef !== next.identityRef;

  return {
    needsWrite,
    metadata: mergeLegacyWhatsAppMappingMetadata(input.metadata, next) as Prisma.InputJsonValue,
  };
}

async function currentPlan(connectionId: string) {
  const contacts = await prisma.whatsAppContact.findMany({
    where: { conversations: { some: whatsappSourceWhere() } },
    orderBy: { id: "asc" },
    select: { id: true, waId: true, metadata: true },
  });

  return contacts.map((contact) => ({
    id: contact.id,
    ...needsRefresh({ ...contact, connectionId }),
  }));
}

async function applyPlan(plan: Awaited<ReturnType<typeof currentPlan>>): Promise<number> {
  const pending = plan.filter((item) => item.needsWrite);
  const batchSize = 200;
  let updated = 0;

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    await prisma.$transaction(
      batch.map((item) =>
        prisma.whatsAppContact.update({
          where: { id: item.id },
          data: { metadata: item.metadata },
          select: { id: true },
        }),
      ),
    );
    updated += batch.length;
  }

  return updated;
}

async function main() {
  assertApplySafety();
  const phoneId = phoneNumberId();
  const connectionId = await activeConnectionId(phoneId);
  const before = await currentPlan(connectionId);
  const needsWriteBefore = before.filter((item) => item.needsWrite).length;

  let updated = 0;
  if (APPLY && needsWriteBefore > 0) {
    updated = await applyPlan(before);
  }

  const after = await currentPlan(connectionId);
  const needsWriteAfter = after.filter((item) => item.needsWrite).length;

  const report = {
    mode: APPLY ? "APPLY" : "DRY_RUN",
    workspaceId: DEFAULT_ENGAGE_WORKSPACE_ID,
    activeConnectionResolved: true,
    contactsScanned: before.length,
    mappingsNeedingRepairBefore: needsWriteBefore,
    mappingsUpdated: updated,
    mappingsNeedingRepairAfter: needsWriteAfter,
    externalWhatsAppWriteSent: false,
    parityPassed: APPLY ? needsWriteAfter === 0 : true,
  };

  console.log(JSON.stringify(report, null, 2));
  if (APPLY && !report.parityPassed) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(
      "WhatsApp provider-binding reconciliation failed:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
