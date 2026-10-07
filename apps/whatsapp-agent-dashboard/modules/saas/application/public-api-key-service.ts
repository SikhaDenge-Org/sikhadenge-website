import {
  createHash,
  randomBytes,
} from "node:crypto";

import {
  assertEnterpriseAccess,
  hashApiKey,
  type ApiKeyRecord,
} from "@/modules/saas/application/enterprise-access";

import type {
  PublicApiScope,
  TenantPlanLimits,
  TenantUsage,
} from "@/modules/saas/domain/tenant-plan";

export const PUBLIC_API_SCOPES:
  readonly PublicApiScope[] = [
    "conversations.read",
    "contacts.read",
    "contacts.write",
    "messages.send",
    "analytics.read",
    "automations.trigger",
  ];

export const PUBLIC_API_SECRET_PREFIX =
  "sd_api_";

export type SafeMetadata =
  Record<
    string,
    string | number | boolean
  >;

export type StoredPublicApiKey = {
  id: string;
  workspaceId: string;
  name: string;
  prefix: string;
  sha256: string;
  scopes: readonly PublicApiScope[];
  revokedAt: Date | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicApiKeyView = {
  id: string;
  workspaceId: string;
  name: string;
  prefix: string;
  scopes: readonly PublicApiScope[];
  revokedAt: Date | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SecurityAuditWrite = {
  workspaceId: string;
  action: string;
  actorId?: string | null;
  entityType: string;
  entityId?: string | null;
  outcome:
    | "SUCCESS"
    | "ALLOWED"
    | "DENIED";
  reasonCode?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  metadata?: SafeMetadata | null;
  occurredAt: Date;
};

export type DeveloperDecisionWrite = {
  workspaceId: string;
  apiKeyId?: string | null;
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  rateLimitDecision: string;
  ipHash?: string | null;
  userAgentHash?: string | null;
  allowed: boolean;
  reasonCode: string;
  requiredScope: PublicApiScope;
  occurredAt: Date;
};

export type FixedWindowConsumeInput = {
  workspaceId: string;
  apiKeyId: string;
  requestId: string;
  method: string;
  path: string;
  ipHash?: string | null;
  userAgentHash?: string | null;
  requiredScope: PublicApiScope;
  windowStart: Date;
  windowEnd: Date;
  windowLimit: number;
  occurredAt: Date;
};

export interface PublicApiKeyRepository {
  createApiKey(
    input: {
      workspaceId: string;
      name: string;
      prefix: string;
      sha256: string;
      scopes: readonly PublicApiScope[];
      expiresAt: Date | null;
      createdAt: Date;
    },
    audit: SecurityAuditWrite,
  ): Promise<StoredPublicApiKey>;

  listApiKeys(
    workspaceId: string,
  ): Promise<StoredPublicApiKey[]>;

  findApiKeyBySha256(
    sha256: string,
  ): Promise<StoredPublicApiKey | null>;

  revokeApiKey(
    input: {
      workspaceId: string;
      keyId: string;
      revokedAt: Date;
    },
    audit: SecurityAuditWrite,
  ): Promise<StoredPublicApiKey | null>;

  recordDeniedDecision(
    input: DeveloperDecisionWrite,
  ): Promise<void>;

  consumeFixedWindow(
    input: FixedWindowConsumeInput,
  ): Promise<{
    allowed: boolean;
    remainingInWindow: number;
  }>;
}

export type PublicApiDenialReason =
  | "api-key-invalid"
  | "tenant-scope-mismatch"
  | "api-key-revoked"
  | "api-key-expired"
  | "scope-denied"
  | "public-api-disabled"
  | "plan-limit-exceeded"
  | "rate-limit-exceeded";

export type PublicApiAuthResult =
  | {
      allowed: true;
      apiKey: PublicApiKeyView;
      remainingInWindow: number;
    }
  | {
      allowed: false;
      reason: PublicApiDenialReason;
    };

function requireText(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${field} is required.`,
    );
  }

  return normalized;
}

function normalizeScopes(
  scopes:
    readonly PublicApiScope[],
): PublicApiScope[] {
  const allowed =
    new Set<string>(
      PUBLIC_API_SCOPES,
    );

  const normalized =
    [
      ...new Set(
        scopes.map(
          (scope) =>
            String(scope)
              .trim() as PublicApiScope,
        ),
      ),
    ];

  if (normalized.length === 0) {
    throw new Error(
      "At least one API scope is required.",
    );
  }

  for (const scope of normalized) {
    if (!allowed.has(scope)) {
      throw new Error(
        `Unsupported API scope: ${scope}`,
      );
    }
  }

  return normalized;
}

function publicView(
  key: StoredPublicApiKey,
): PublicApiKeyView {
  return {
    id: key.id,
    workspaceId: key.workspaceId,
    name: key.name,
    prefix: key.prefix,
    scopes: [...key.scopes],
    revokedAt: key.revokedAt,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}

function hashOptional(
  value: string | null | undefined,
): string | null {
  const normalized =
    value?.trim();

  if (!normalized) {
    return null;
  }

  return createHash("sha256")
    .update(normalized)
    .digest("hex");
}

function fixedWindowBounds(
  now: Date,
  windowMs: number,
): {
  windowStart: Date;
  windowEnd: Date;
} {
  if (
    !Number.isInteger(windowMs) ||
    windowMs < 1000
  ) {
    throw new Error(
      "API rate-limit window must be at least 1000ms.",
    );
  }

  const timestamp =
    now.getTime();

  if (!Number.isFinite(timestamp)) {
    throw new Error(
      "API request time is invalid.",
    );
  }

  const start =
    Math.floor(
      timestamp / windowMs,
    ) * windowMs;

  return {
    windowStart:
      new Date(start),

    windowEnd:
      new Date(
        start + windowMs,
      ),
  };
}

function reasonCode(
  reason: PublicApiDenialReason,
): string {
  return reason
    .replaceAll("-", "_")
    .toUpperCase();
}

function rateDecision(
  reason: PublicApiDenialReason,
): string {
  return `DENIED_${reasonCode(reason)}`;
}

function denialStatus(
  reason: PublicApiDenialReason,
): number {
  switch (reason) {
    case "rate-limit-exceeded":
      return 429;

    case "tenant-scope-mismatch":
    case "scope-denied":
    case "public-api-disabled":
    case "plan-limit-exceeded":
      return 403;

    default:
      return 401;
  }
}

function mapAccessError(
  error: unknown,
): PublicApiDenialReason {
  const message =
    (
      error instanceof Error
        ? error.message
        : String(error)
    ).toLowerCase();

  if (
    message.includes(
      "cross-tenant access denied",
    )
  ) {
    return "tenant-scope-mismatch";
  }

  if (
    message.includes("scope denied")
  ) {
    return "scope-denied";
  }

  if (
    message.includes(
      "public api is disabled",
    )
  ) {
    return "public-api-disabled";
  }

  if (
    message.includes("limit exceeded")
  ) {
    return "plan-limit-exceeded";
  }

  return "api-key-invalid";
}

async function deny(
  repository: PublicApiKeyRepository,
  input: {
    workspaceId: string;
    apiKeyId?: string | null;
    requestId: string;
    method: string;
    path: string;
    requiredScope:
      PublicApiScope;
    reason:
      PublicApiDenialReason;
    ipAddress?:
      string | null;
    userAgent?:
      string | null;
    now: Date;
  },
): Promise<PublicApiAuthResult> {
  await repository
    .recordDeniedDecision({
      workspaceId:
        input.workspaceId,

      apiKeyId:
        input.apiKeyId
        ?? null,

      requestId:
        input.requestId,

      method:
        input.method,

      path:
        input.path,

      statusCode:
        denialStatus(
          input.reason,
        ),

      rateLimitDecision:
        rateDecision(
          input.reason,
        ),

      ipHash:
        hashOptional(
          input.ipAddress,
        ),

      userAgentHash:
        hashOptional(
          input.userAgent,
        ),

      allowed: false,

      reasonCode:
        reasonCode(
          input.reason,
        ),

      requiredScope:
        input.requiredScope,

      occurredAt:
        input.now,
    });

  return {
    allowed: false,
    reason:
      input.reason,
  };
}

export async function createPublicApiKey(
  repository: PublicApiKeyRepository,
  input: {
    workspaceId: string;
    name: string;
    scopes:
      readonly PublicApiScope[];
    expiresAt?: Date | null;
    actorId?: string | null;
    requestId: string;
    now?: Date;
  },
): Promise<{
  apiKey: PublicApiKeyView;
  secret: string;
}> {
  const now =
    input.now ??
    new Date();

  const workspaceId =
    requireText(
      input.workspaceId,
      "workspaceId",
    );

  const name =
    requireText(
      input.name,
      "name",
    );

  const requestId =
    requireText(
      input.requestId,
      "requestId",
    );

  const scopes =
    normalizeScopes(
      input.scopes,
    );

  const expiresAt =
    input.expiresAt ??
    null;

  if (
    expiresAt &&
    expiresAt.getTime() <=
      now.getTime()
  ) {
    throw new Error(
      "API key expiry must be in the future.",
    );
  }

  const token =
    randomBytes(32)
      .toString(
        "base64url",
      );

  const secret =
    `${PUBLIC_API_SECRET_PREFIX}${token}`;

  const prefix =
    `${PUBLIC_API_SECRET_PREFIX}${token.slice(
      0,
      12,
    )}`;

  const sha256 =
    hashApiKey(secret);

  const row =
    await repository
      .createApiKey(
        {
          workspaceId,
          name,
          prefix,
          sha256,
          scopes,
          expiresAt,
          createdAt: now,
        },
        {
          workspaceId,

          action:
            "public-api.key.create",

          actorId:
            input.actorId
            ?? null,

          entityType:
            "PUBLIC_API_KEY",

          entityId: null,

          outcome:
            "SUCCESS",

          requestId,

          correlationId:
            requestId,

          metadata: {
            name,
            prefix,
            scopeCount:
              scopes.length,
          },

          occurredAt: now,
        },
      );

  return {
    apiKey:
      publicView(row),

    secret,
  };
}

export async function listPublicApiKeys(
  repository: PublicApiKeyRepository,
  workspaceId: string,
): Promise<PublicApiKeyView[]> {
  const normalized =
    requireText(
      workspaceId,
      "workspaceId",
    );

  const rows =
    await repository
      .listApiKeys(
        normalized,
      );

  return rows.map(publicView);
}

export async function revokePublicApiKey(
  repository: PublicApiKeyRepository,
  input: {
    workspaceId: string;
    keyId: string;
    actorId?: string | null;
    requestId: string;
    now?: Date;
  },
): Promise<PublicApiKeyView> {
  const now =
    input.now ??
    new Date();

  const workspaceId =
    requireText(
      input.workspaceId,
      "workspaceId",
    );

  const keyId =
    requireText(
      input.keyId,
      "keyId",
    );

  const requestId =
    requireText(
      input.requestId,
      "requestId",
    );

  const row =
    await repository
      .revokeApiKey(
        {
          workspaceId,
          keyId,
          revokedAt: now,
        },
        {
          workspaceId,

          action:
            "public-api.key.revoke",

          actorId:
            input.actorId
            ?? null,

          entityType:
            "PUBLIC_API_KEY",

          entityId: keyId,

          outcome:
            "SUCCESS",

          requestId,

          correlationId:
            requestId,

          occurredAt: now,
        },
      );

  if (!row) {
    throw new Error(
      "API key not found.",
    );
  }

  return publicView(row);
}

export async function authenticatePublicApiKey(
  repository: PublicApiKeyRepository,
  input: {
    secret: string;
    activeWorkspaceId: string;
    resourceWorkspaceId: string;
    requiredScope:
      PublicApiScope;
    limits:
      TenantPlanLimits;
    projectedUsage:
      TenantUsage;
    windowLimit: number;
    windowMs?: number;
    requestId: string;
    method: string;
    path: string;
    ipAddress?:
      string | null;
    userAgent?:
      string | null;
    now?: Date;
  },
): Promise<PublicApiAuthResult> {
  const now =
    input.now ??
    new Date();

  const activeWorkspaceId =
    requireText(
      input.activeWorkspaceId,
      "activeWorkspaceId",
    );

  const resourceWorkspaceId =
    requireText(
      input.resourceWorkspaceId,
      "resourceWorkspaceId",
    );

  const requestId =
    requireText(
      input.requestId,
      "requestId",
    );

  const method =
    requireText(
      input.method,
      "method",
    ).toUpperCase();

  const path =
    requireText(
      input.path,
      "path",
    );

  if (
    !Number.isInteger(
      input.windowLimit,
    ) ||
    input.windowLimit < 1
  ) {
    throw new Error(
      "API rate-limit value is invalid.",
    );
  }

  let digest: string;

  try {
    digest =
      hashApiKey(
        input.secret,
      );
  } catch {
    return deny(
      repository,
      {
        workspaceId:
          activeWorkspaceId,
        requestId,
        method,
        path,
        requiredScope:
          input.requiredScope,
        reason:
          "api-key-invalid",
        ipAddress:
          input.ipAddress,
        userAgent:
          input.userAgent,
        now,
      },
    );
  }

  const key =
    await repository
      .findApiKeyBySha256(
        digest,
      );

  if (!key) {
    return deny(
      repository,
      {
        workspaceId:
          activeWorkspaceId,
        requestId,
        method,
        path,
        requiredScope:
          input.requiredScope,
        reason:
          "api-key-invalid",
        ipAddress:
          input.ipAddress,
        userAgent:
          input.userAgent,
        now,
      },
    );
  }

  if (
    key.workspaceId !==
    activeWorkspaceId
  ) {
    return deny(
      repository,
      {
        workspaceId:
          activeWorkspaceId,

        apiKeyId: null,

        requestId,
        method,
        path,

        requiredScope:
          input.requiredScope,

        reason:
          "tenant-scope-mismatch",

        ipAddress:
          input.ipAddress,

        userAgent:
          input.userAgent,

        now,
      },
    );
  }

  if (key.revokedAt) {
    return deny(
      repository,
      {
        workspaceId:
          activeWorkspaceId,

        apiKeyId:
          key.id,

        requestId,
        method,
        path,

        requiredScope:
          input.requiredScope,

        reason:
          "api-key-revoked",

        ipAddress:
          input.ipAddress,

        userAgent:
          input.userAgent,

        now,
      },
    );
  }

  if (
    key.expiresAt &&
    key.expiresAt.getTime() <=
      now.getTime()
  ) {
    return deny(
      repository,
      {
        workspaceId:
          activeWorkspaceId,

        apiKeyId:
          key.id,

        requestId,
        method,
        path,

        requiredScope:
          input.requiredScope,

        reason:
          "api-key-expired",

        ipAddress:
          input.ipAddress,

        userAgent:
          input.userAgent,

        now,
      },
    );
  }

  const apiKeyRecord:
    ApiKeyRecord = {
      id: key.id,
      workspaceId:
        key.workspaceId,
      sha256:
        key.sha256,
      scopes:
        key.scopes,
      revoked: false,
      expiresAt:
        key.expiresAt,
    };

  try {
    assertEnterpriseAccess({
      activeWorkspaceId,
      resourceWorkspaceId,

      secret:
        input.secret,

      apiKey:
        apiKeyRecord,

      requiredScope:
        input.requiredScope,

      limits:
        input.limits,

      projectedUsage:
        input.projectedUsage,

      now,
    });
  } catch (error) {
    return deny(
      repository,
      {
        workspaceId:
          activeWorkspaceId,

        apiKeyId:
          key.id,

        requestId,
        method,
        path,

        requiredScope:
          input.requiredScope,

        reason:
          mapAccessError(
            error,
          ),

        ipAddress:
          input.ipAddress,

        userAgent:
          input.userAgent,

        now,
      },
    );
  }

  const {
    windowStart,
    windowEnd,
  } = fixedWindowBounds(
    now,
    input.windowMs ??
      60_000,
  );

  const rate =
    await repository
      .consumeFixedWindow({
        workspaceId:
          activeWorkspaceId,

        apiKeyId:
          key.id,

        requestId,
        method,
        path,

        ipHash:
          hashOptional(
            input.ipAddress,
          ),

        userAgentHash:
          hashOptional(
            input.userAgent,
          ),

        requiredScope:
          input.requiredScope,

        windowStart,
        windowEnd,

        windowLimit:
          input.windowLimit,

        occurredAt:
          now,
      });

  if (!rate.allowed) {
    return {
      allowed: false,
      reason:
        "rate-limit-exceeded",
    };
  }

  return {
    allowed: true,

    apiKey:
      publicView({
        ...key,
        lastUsedAt: now,
        updatedAt: now,
      }),

    remainingInWindow:
      rate.remainingInWindow,
  };
}
