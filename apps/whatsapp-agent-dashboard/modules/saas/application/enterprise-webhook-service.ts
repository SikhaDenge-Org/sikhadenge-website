import {
  isIP,
} from "node:net";
import {
  randomBytes,
  randomUUID,
} from "node:crypto";

import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  type EncryptedWebhookSecret,
} from "@/modules/saas/infrastructure/webhook-secret-crypto";
import {
  signOutboundWebhook,
  verifyOutboundWebhookSignature,
} from "@/modules/saas/infrastructure/signed-webhook";

export const OUTBOUND_WEBHOOK_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "REVOKED",
] as const;

export type OutboundWebhookStatus =
  (typeof OUTBOUND_WEBHOOK_STATUSES)[number];

export type SafeWebhookMetadata =
  Record<
    string,
    string | number | boolean | null
  >;

export type OutboundWebhookEndpoint = {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  events: string[];
  status: OutboundWebhookStatus;
  keyVersion: string;
  pausedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredOutboundWebhookEndpoint =
  OutboundWebhookEndpoint & {
    encryptedSecret:
      EncryptedWebhookSecret;
  };

export type WebhookSecurityAuditWrite = {
  workspaceId: string;
  actorId?: string | null;
  action: string;
  outcome: "ALLOWED" | "DENIED";
  entityId?: string | null;
  reasonCode?: string | null;
  requestId?: string | null;
  metadata?: SafeWebhookMetadata;
  occurredAt: Date;
};

export type WebhookDeveloperLogWrite = {
  workspaceId: string;
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  decision: string;
  endpointId?: string | null;
  metadata?: SafeWebhookMetadata;
  occurredAt: Date;
};

export interface EnterpriseWebhookRepository {
  createEndpoint(
    input: {
      id: string;
      workspaceId: string;
      name: string;
      url: string;
      events: string[];
      encryptedSecret:
        EncryptedWebhookSecret;
      createdAt: Date;
    },
    audit:
      WebhookSecurityAuditWrite,
  ): Promise<StoredOutboundWebhookEndpoint>;

  listEndpoints(
    workspaceId: string,
  ): Promise<StoredOutboundWebhookEndpoint[]>;

  findEndpoint(
    workspaceId: string,
    endpointId: string,
  ): Promise<StoredOutboundWebhookEndpoint | null>;

  setEndpointStatus(
    input: {
      workspaceId: string;
      endpointId: string;
      status: OutboundWebhookStatus;
      changedAt: Date;
    },
    audit:
      WebhookSecurityAuditWrite,
  ): Promise<StoredOutboundWebhookEndpoint | null>;

  recordDeveloperLog(
    input:
      WebhookDeveloperLogWrite,
  ): Promise<void>;
}

function sanitizeEndpoint(
  endpoint:
    StoredOutboundWebhookEndpoint,
): OutboundWebhookEndpoint {
  const {
    encryptedSecret: _encryptedSecret,
    ...safe
  } = endpoint;

  return safe;
}

function normalizeName(
  name: string,
): string {
  const normalized =
    name.trim().replace(/\s+/g, " ");

  if (
    normalized.length < 2 ||
    normalized.length > 120
  ) {
    throw new Error(
      "Webhook endpoint name is invalid.",
    );
  }

  return normalized;
}

function isPrivateIpv4(
  hostname: string,
): boolean {
  const parts =
    hostname.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (value) =>
        !Number.isInteger(value) ||
        value < 0 ||
        value > 255,
    )
  ) {
    return false;
  }

  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (
      parts[0] === 169 &&
      parts[1] === 254
    ) ||
    (
      parts[0] === 172 &&
      parts[1] >= 16 &&
      parts[1] <= 31
    ) ||
    (
      parts[0] === 192 &&
      parts[1] === 168
    )
  );
}

export function normalizeEnterpriseWebhookUrl(
  raw: string,
): string {
  let parsed: URL;

  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error(
      "Webhook endpoint URL is invalid.",
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error(
      "Webhook endpoint must be a credential-free HTTPS URL.",
    );
  }

  const hostname =
    parsed.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    (
      isIP(hostname) === 4 &&
      isPrivateIpv4(hostname)
    )
  ) {
    throw new Error(
      "Webhook endpoint host is not allowed.",
    );
  }

  parsed.hostname = hostname;

  return parsed.toString();
}

export function normalizeWebhookEvents(
  events: readonly string[],
): string[] {
  const normalized = [
    ...new Set(
      events.map(
        (event) =>
          event.trim().toLowerCase(),
      ),
    ),
  ];

  if (
    normalized.length === 0 ||
    normalized.length > 50 ||
    normalized.some(
      (event) =>
        !/^[a-z0-9][a-z0-9._:-]{0,79}$/.test(
          event,
        ),
    )
  ) {
    throw new Error(
      "Webhook event subscription is invalid.",
    );
  }

  return normalized.sort();
}

function newSigningSecret(): string {
  return randomBytes(48)
    .toString("base64url");
}

export async function createEnterpriseWebhookEndpoint(
  repository:
    EnterpriseWebhookRepository,
  input: {
    workspaceId: string;
    actorId?: string | null;
    requestId?: string | null;
    name: string;
    url: string;
    events: readonly string[];
    encryptionKey: Buffer;
    keyVersion: string;
    now?: Date;
  },
): Promise<{
  endpoint: OutboundWebhookEndpoint;
  signingSecret: string;
}> {
  const now =
    input.now ?? new Date();

  const signingSecret =
    newSigningSecret();

  const encryptedSecret =
    encryptWebhookSecret({
      plaintext:
        signingSecret,
      key:
        input.encryptionKey,
      keyVersion:
        input.keyVersion,
    });

  const stored =
    await repository.createEndpoint(
      {
        id:
          randomUUID(),
        workspaceId:
          input.workspaceId,
        name:
          normalizeName(input.name),
        url:
          normalizeEnterpriseWebhookUrl(
            input.url,
          ),
        events:
          normalizeWebhookEvents(
            input.events,
          ),
        encryptedSecret,
        createdAt:
          now,
      },
      {
        workspaceId:
          input.workspaceId,
        actorId:
          input.actorId ?? null,
        action:
          "enterprise-webhook.create",
        outcome:
          "ALLOWED",
        reasonCode:
          "ENDPOINT_CREATED",
        requestId:
          input.requestId ?? null,
        occurredAt:
          now,
      },
    );

  return {
    endpoint:
      sanitizeEndpoint(stored),
    signingSecret,
  };
}

export async function listEnterpriseWebhookEndpoints(
  repository:
    EnterpriseWebhookRepository,
  workspaceId: string,
): Promise<OutboundWebhookEndpoint[]> {
  const rows =
    await repository.listEndpoints(
      workspaceId,
    );

  return rows.map(
    sanitizeEndpoint,
  );
}

async function changeStatus(
  repository:
    EnterpriseWebhookRepository,
  input: {
    workspaceId: string;
    endpointId: string;
    actorId?: string | null;
    requestId?: string | null;
    status: "PAUSED" | "REVOKED";
    now?: Date;
  },
): Promise<OutboundWebhookEndpoint> {
  const now =
    input.now ?? new Date();

  const stored =
    await repository.setEndpointStatus(
      {
        workspaceId:
          input.workspaceId,
        endpointId:
          input.endpointId,
        status:
          input.status,
        changedAt:
          now,
      },
      {
        workspaceId:
          input.workspaceId,
        actorId:
          input.actorId ?? null,
        action:
          input.status === "PAUSED"
            ? "enterprise-webhook.pause"
            : "enterprise-webhook.revoke",
        outcome:
          "ALLOWED",
        entityId:
          input.endpointId,
        reasonCode:
          input.status === "PAUSED"
            ? "ENDPOINT_PAUSED"
            : "ENDPOINT_REVOKED",
        requestId:
          input.requestId ?? null,
        occurredAt:
          now,
      },
    );

  if (!stored) {
    throw new Error(
      "Webhook endpoint was not found in this workspace.",
    );
  }

  return sanitizeEndpoint(stored);
}

export function pauseEnterpriseWebhookEndpoint(
  repository:
    EnterpriseWebhookRepository,
  input: {
    workspaceId: string;
    endpointId: string;
    actorId?: string | null;
    requestId?: string | null;
    now?: Date;
  },
) {
  return changeStatus(
    repository,
    {
      ...input,
      status: "PAUSED",
    },
  );
}

export function revokeEnterpriseWebhookEndpoint(
  repository:
    EnterpriseWebhookRepository,
  input: {
    workspaceId: string;
    endpointId: string;
    actorId?: string | null;
    requestId?: string | null;
    now?: Date;
  },
) {
  return changeStatus(
    repository,
    {
      ...input,
      status: "REVOKED",
    },
  );
}

export async function prepareEnterpriseWebhookDelivery(
  repository:
    EnterpriseWebhookRepository,
  input: {
    workspaceId: string;
    endpointId: string;
    requestId: string;
    body: string;
    encryptionKey: Buffer;
    expectedKeyVersion?: string;
    now?: Date;
  },
): Promise<{
  endpointId: string;
  url: string;
  body: string;
  headers: {
    "content-type": "application/json";
    "x-sikhadenge-webhook-id": string;
    "x-sikhadenge-webhook-timestamp": string;
    "x-sikhadenge-webhook-signature": string;
  };
}> {
  const now =
    input.now ?? new Date();

  const endpoint =
    await repository.findEndpoint(
      input.workspaceId,
      input.endpointId,
    );

  if (
    !endpoint ||
    endpoint.status !== "ACTIVE"
  ) {
    await repository.recordDeveloperLog({
      workspaceId:
        input.workspaceId,
      requestId:
        input.requestId,
      method:
        "POST",
      path:
        `/developer/webhooks/${input.endpointId}/prepare`,
      statusCode: 409,
      decision:
        !endpoint
          ? "DENIED_NOT_FOUND"
          : `DENIED_${endpoint.status}`,
      endpointId:
        endpoint?.id ?? null,
      occurredAt:
        now,
    });

    throw new Error(
      "Webhook endpoint is not active.",
    );
  }

  const secret =
    decryptWebhookSecret({
      encrypted:
        endpoint.encryptedSecret,
      key:
        input.encryptionKey,
      expectedKeyVersion:
        input.expectedKeyVersion,
    });

  const timestamp =
    now.getTime();

  const signature =
    signOutboundWebhook({
      secret,
      timestamp,
      body:
        input.body,
    });

  await repository.recordDeveloperLog({
    workspaceId:
      input.workspaceId,
    requestId:
      input.requestId,
    method:
      "POST",
    path:
      `/developer/webhooks/${endpoint.id}/prepare`,
    statusCode: 200,
    decision:
      "SIGNED_NO_NETWORK_DELIVERY",
    endpointId:
      endpoint.id,
    metadata: {
      keyVersion:
        endpoint.keyVersion,
      status:
        endpoint.status,
    },
    occurredAt:
      now,
  });

  return {
    endpointId:
      endpoint.id,
    url:
      endpoint.url,
    body:
      input.body,
    headers: {
      "content-type":
        "application/json",
      "x-sikhadenge-webhook-id":
        endpoint.id,
      "x-sikhadenge-webhook-timestamp":
        String(timestamp),
      "x-sikhadenge-webhook-signature":
        signature,
    },
  };
}

export async function verifyEnterpriseWebhookDelivery(
  repository:
    EnterpriseWebhookRepository,
  input: {
    workspaceId: string;
    endpointId: string;
    timestamp: number;
    body: string;
    signature: string;
    encryptionKey: Buffer;
    expectedKeyVersion?: string;
    now?: number;
    replayWindowMs?: number;
  },
): Promise<boolean> {
  const endpoint =
    await repository.findEndpoint(
      input.workspaceId,
      input.endpointId,
    );

  if (
    !endpoint ||
    endpoint.status !== "ACTIVE"
  ) {
    return false;
  }

  const secret =
    decryptWebhookSecret({
      encrypted:
        endpoint.encryptedSecret,
      key:
        input.encryptionKey,
      expectedKeyVersion:
        input.expectedKeyVersion,
    });

  return verifyOutboundWebhookSignature({
    secret,
    timestamp:
      input.timestamp,
    body:
      input.body,
    signature:
      input.signature,
    now:
      input.now,
    replayWindowMs:
      input.replayWindowMs,
  });
}
