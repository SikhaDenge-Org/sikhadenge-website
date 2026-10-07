export type ConnectorLifecycleStatus =
  | "UNAVAILABLE"
  | "OFFICIAL_API_REQUIRED"
  | "READY_FOR_TEST"
  | "VERIFIED"
  | "DEGRADED"
  | "REVOKED";

export type ConnectorReadiness = {
  connector: string;
  officialApiVerified: boolean;
  requiredPermissionsVerified: boolean;
  quotaDocumented: boolean;
  webhookRequired: boolean;
  webhookVerified: boolean;
  credentialRevoked: boolean;
};

export function deriveConnectorLifecycleStatus(
  readiness: ConnectorReadiness,
): ConnectorLifecycleStatus {
  if (readiness.credentialRevoked) return "REVOKED";
  if (!readiness.officialApiVerified) return "OFFICIAL_API_REQUIRED";
  if (!readiness.requiredPermissionsVerified || !readiness.quotaDocumented) {
    return "READY_FOR_TEST";
  }
  if (readiness.webhookRequired && !readiness.webhookVerified) return "DEGRADED";
  return "VERIFIED";
}

export function connectorCanActivate(readiness: ConnectorReadiness): boolean {
  return deriveConnectorLifecycleStatus(readiness) === "VERIFIED";
}

export const PLANNED_OFFICIAL_CONNECTORS = Object.freeze([
  "YOUTUBE_COMMENTS",
  "GOOGLE_BUSINESS_REVIEWS",
  "THREADS",
  "LINKEDIN_ORGANIZATION",
  "TIKTOK_BUSINESS",
  "WEBSITE_CHAT",
] as const);
