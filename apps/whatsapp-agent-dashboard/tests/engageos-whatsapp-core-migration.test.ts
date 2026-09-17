import assert from "node:assert/strict";

import {
  assertWhatsAppCoreConfiguration,
  mapWhatsAppDeliveryStatus,
  normalizedWhatsAppConversationRef,
  whatsAppCoreMode,
} from "../modules/channels/whatsapp/application/whatsapp-channel-adapter";
import {
  buildLegacyWhatsAppIdentityMapping,
  mergeLegacyWhatsAppMappingMetadata,
  readLegacyWhatsAppMappingMetadata,
} from "../modules/channels/whatsapp/application/legacy-identity-mapping";
import { syncLegacyWhatsAppIdentityMappingForInbound } from "../modules/channels/whatsapp/application/provider-connection-binding";

async function main() {
  assert.equal(whatsAppCoreMode({}), "legacy");
  assert.equal(whatsAppCoreMode({ ENGAGEOS_WHATSAPP_CORE_MODE: "SHADOW" }), "shadow");
  assert.equal(whatsAppCoreMode({ ENGAGEOS_WHATSAPP_CORE_MODE: "normalized" }), "normalized");
  assert.doesNotThrow(() => assertWhatsAppCoreConfiguration({}));
  assert.throws(
    () => assertWhatsAppCoreConfiguration({ ENGAGEOS_WHATSAPP_CORE_MODE: "normalized" }),
    /EVENT_RUNTIME_ENABLED/,
  );
  assert.doesNotThrow(() =>
    assertWhatsAppCoreConfiguration({
      ENGAGEOS_WHATSAPP_CORE_MODE: "normalized",
      ENGAGEOS_EVENT_RUNTIME_ENABLED: "true",
      ENGAGEOS_EVENT_WORKER_ENABLED: "true",
      ENGAGEOS_WHATSAPP_BACKFILL_COMPLETE: "true",
      WHATSAPP_PHONE_NUMBER_ID: "12345",
    }),
  );

  const first = buildLegacyWhatsAppIdentityMapping({
    workspaceId: "engagews_default",
    connectionId: "whatsapp:12345",
    legacyContactId: "contact-1",
    waId: "919999999999",
  });
  const second = buildLegacyWhatsAppIdentityMapping({
    workspaceId: "engagews_default",
    connectionId: "whatsapp:12345",
    legacyContactId: "contact-1",
    waId: "919999999999",
  });
  assert.deepEqual(first, second);
  assert.match(first.customerRef, /^customer_wa_[a-f0-9]{24}$/);
  assert.match(first.identityRef, /^identity_wa_[a-f0-9]{24}$/);

  const merged = mergeLegacyWhatsAppMappingMetadata(
    { existing: { keep: true }, engageos: { other: "preserved" } },
    first,
  );
  assert.deepEqual((merged.existing as Record<string, unknown>).keep, true);
  assert.equal((merged.engageos as Record<string, unknown>).other, "preserved");
  assert.deepEqual(readLegacyWhatsAppMappingMetadata(merged), first);

  const updates: Array<Record<string, unknown>> = [];
  const transaction = {
    engageChannelConnection: {
      findFirst: async () => ({ id: "conn_real_123" }),
    },
    whatsAppContact: {
      update: async (args: Record<string, unknown>) => {
        updates.push(args);
        return { id: "contact-1" };
      },
    },
  };

  const refreshed = await syncLegacyWhatsAppIdentityMappingForInbound(
    transaction as never,
    {
      contactId: "contact-1",
      waId: "919999999999",
      phoneNumberId: "12345",
      metadata: merged,
    },
  );
  assert.equal(refreshed.updated, true);
  assert.equal(refreshed.connectionId, "conn_real_123");
  assert.equal(updates.length, 1);

  const updatedArgs = updates[0] as {
    data: { metadata: unknown };
  };
  const refreshedMapping = readLegacyWhatsAppMappingMetadata(updatedArgs.data.metadata);
  assert.equal(refreshedMapping?.connectionId, "conn_real_123");
  assert.equal(refreshedMapping?.workspaceId, "engagews_default");
  assert.equal(refreshedMapping?.legacyContactId, "contact-1");
  assert.equal(refreshedMapping?.externalUserId, "919999999999");

  const noProviderId = await syncLegacyWhatsAppIdentityMappingForInbound(
    transaction as never,
    {
      contactId: "contact-1",
      waId: "919999999999",
      phoneNumberId: null,
      metadata: updatedArgs.data.metadata as never,
    },
  );
  assert.deepEqual(noProviderId, { updated: false, connectionId: null });
  assert.equal(updates.length, 1);

  assert.equal(normalizedWhatsAppConversationRef("conv-123"), "conv-123");
  assert.throws(() => normalizedWhatsAppConversationRef("  "), /required/);
  assert.equal(mapWhatsAppDeliveryStatus("sent"), "SENT");
  assert.equal(mapWhatsAppDeliveryStatus("DELIVERED"), "DELIVERED");
  assert.equal(mapWhatsAppDeliveryStatus("read"), "READ");
  assert.equal(mapWhatsAppDeliveryStatus("failed"), "FAILED");
  assert.equal(mapWhatsAppDeliveryStatus("mystery"), "UNKNOWN");

  console.log("EngageOS WhatsApp core migration tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
