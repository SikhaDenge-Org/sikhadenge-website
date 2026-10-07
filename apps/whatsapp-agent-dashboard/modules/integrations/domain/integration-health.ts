export type IntegrationStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "DEGRADED"
  | "EXPIRED"
  | "REVOKED";

export type IntegrationCapability = {
  supported: boolean;
  verified: boolean;
  lastVerifiedAt?: Date;
  reason?: string;
};

export type IntegrationEvidence = {
  apiVerifiedAt?: Date;
  webhookRequired: boolean;
  webhookVerifiedAt?: Date;
  permissionsVerified: boolean;
  tokenExpiresAt?: Date;
  revokedAt?: Date;
  disconnectedAt?: Date;
};

export function deriveIntegrationStatus(
  evidence: IntegrationEvidence,
  now = new Date(),
): IntegrationStatus {
  if (evidence.disconnectedAt) return "DISCONNECTED";
  if (evidence.revokedAt) return "REVOKED";
  if (evidence.tokenExpiresAt && evidence.tokenExpiresAt.getTime() <= now.getTime()) {
    return "EXPIRED";
  }
  if (!evidence.apiVerifiedAt) return "CONNECTING";
  if (!evidence.permissionsVerified) return "DEGRADED";
  if (evidence.webhookRequired && !evidence.webhookVerifiedAt) return "DEGRADED";
  return "CONNECTED";
}

export function capabilityUsable(
  status: IntegrationStatus,
  capability: IntegrationCapability | undefined,
): boolean {
  return status === "CONNECTED" && Boolean(capability?.supported && capability.verified);
}

export function assertCapabilityUsable(
  status: IntegrationStatus,
  capabilityName: string,
  capability: IntegrationCapability | undefined,
): void {
  if (!capabilityUsable(status, capability)) {
    throw new Error(`Integration capability ${capabilityName} is not verified and usable.`);
  }
}
