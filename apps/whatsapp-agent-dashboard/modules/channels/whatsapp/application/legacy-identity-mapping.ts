import { createHash } from "node:crypto";

export const WHATSAPP_MAPPING_SCHEMA_VERSION = 1;

export type LegacyWhatsAppIdentityMapping = {
  schemaVersion: 1;
  workspaceId: string;
  channel: "WHATSAPP";
  connectionId: string;
  legacyContactId: string;
  externalUserId: string;
  customerRef: string;
  identityRef: string;
};

function nonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function stableRef(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

export function buildLegacyWhatsAppIdentityMapping(input: {
  workspaceId: string;
  connectionId: string;
  legacyContactId: string;
  waId: string;
}): LegacyWhatsAppIdentityMapping {
  const workspaceId = nonEmpty(input.workspaceId, "workspaceId");
  const connectionId = nonEmpty(input.connectionId, "connectionId");
  const legacyContactId = nonEmpty(input.legacyContactId, "legacyContactId");
  const externalUserId = nonEmpty(input.waId, "waId");
  const identityKey = [workspaceId, connectionId, "WHATSAPP", externalUserId].join(":");

  return {
    schemaVersion: WHATSAPP_MAPPING_SCHEMA_VERSION,
    workspaceId,
    channel: "WHATSAPP",
    connectionId,
    legacyContactId,
    externalUserId,
    customerRef: stableRef("customer_wa", identityKey),
    identityRef: stableRef("identity_wa", identityKey),
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function mergeLegacyWhatsAppMappingMetadata(
  existing: unknown,
  mapping: LegacyWhatsAppIdentityMapping,
): Record<string, unknown> {
  const root = objectValue(existing);
  const engageos = objectValue(root.engageos);
  return {
    ...root,
    engageos: {
      ...engageos,
      whatsappIdentity: mapping,
    },
  };
}

export function readLegacyWhatsAppMappingMetadata(
  metadata: unknown,
): LegacyWhatsAppIdentityMapping | null {
  const root = objectValue(metadata);
  const engageos = objectValue(root.engageos);
  const candidate = engageos.whatsappIdentity;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const value = candidate as Record<string, unknown>;
  if (
    value.schemaVersion !== WHATSAPP_MAPPING_SCHEMA_VERSION ||
    value.channel !== "WHATSAPP" ||
    typeof value.customerRef !== "string" ||
    typeof value.identityRef !== "string" ||
    typeof value.externalUserId !== "string" ||
    typeof value.legacyContactId !== "string" ||
    typeof value.connectionId !== "string" ||
    typeof value.workspaceId !== "string"
  ) {
    return null;
  }
  return value as LegacyWhatsAppIdentityMapping;
}
