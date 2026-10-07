import {
  connectorCanActivate,
  deriveConnectorLifecycleStatus,
  type ConnectorReadiness,
} from "@/modules/channels/core/contracts/connector-registry";

export type OfficialConnectorTransport = "OFFICIAL_API" | "UNOFFICIAL_SCRAPER" | "MANUAL_IMPORT";

export type ConnectorDefinition = {
  key: string;
  displayName: string;
  webhookRequired: boolean;
  writeCapability: boolean;
};

export const OFFICIAL_CONNECTOR_CATALOG: readonly ConnectorDefinition[] = Object.freeze([
  { key: "YOUTUBE_COMMENTS", displayName: "YouTube Comments", webhookRequired: false, writeCapability: true },
  { key: "GOOGLE_BUSINESS_REVIEWS", displayName: "Google Business Reviews", webhookRequired: false, writeCapability: true },
  { key: "THREADS", displayName: "Threads", webhookRequired: true, writeCapability: true },
  { key: "LINKEDIN_ORGANIZATION", displayName: "LinkedIn Organization", webhookRequired: true, writeCapability: true },
  { key: "TIKTOK_BUSINESS", displayName: "TikTok Business", webhookRequired: true, writeCapability: true },
  { key: "WEBSITE_CHAT", displayName: "Website Chat", webhookRequired: true, writeCapability: true },
]);

export type ConnectorActivationDecision = {
  allowed: boolean;
  lifecycle: ReturnType<typeof deriveConnectorLifecycleStatus>;
  reason: string;
};

export function evaluateOfficialConnectorActivation(input: {
  connectorKey: string;
  transport: OfficialConnectorTransport;
  readiness: ConnectorReadiness;
  externalWritesRequested: boolean;
  controlledWriteProbeApproved: boolean;
}): ConnectorActivationDecision {
  const definition = OFFICIAL_CONNECTOR_CATALOG.find((item) => item.key === input.connectorKey);
  if (!definition) {
    return { allowed: false, lifecycle: "UNAVAILABLE", reason: "Connector is not in the approved official catalog." };
  }
  if (input.transport !== "OFFICIAL_API") {
    return {
      allowed: false,
      lifecycle: "OFFICIAL_API_REQUIRED",
      reason: "Unofficial scraping or browser automation cannot substitute for an official connector API.",
    };
  }
  if (definition.webhookRequired !== input.readiness.webhookRequired) {
    return {
      allowed: false,
      lifecycle: "DEGRADED",
      reason: "Connector webhook requirement does not match the approved connector contract.",
    };
  }
  const lifecycle = deriveConnectorLifecycleStatus(input.readiness);
  if (!connectorCanActivate(input.readiness)) {
    return { allowed: false, lifecycle, reason: `Connector readiness is ${lifecycle}.` };
  }
  if (input.externalWritesRequested && definition.writeCapability && !input.controlledWriteProbeApproved) {
    return {
      allowed: false,
      lifecycle,
      reason: "External writes require a separately approved controlled provider write probe.",
    };
  }
  return { allowed: true, lifecycle, reason: "Official connector evidence gates passed." };
}
