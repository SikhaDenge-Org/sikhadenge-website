import assert from "node:assert/strict";
import fs from "node:fs";

import {
  hashApiKey,
  verifyApiKey,
} from "../modules/saas/application/enterprise-access";

import {
  authenticatePublicApiKey,
  createPublicApiKey,
  listPublicApiKeys,
  revokePublicApiKey,
  type DeveloperDecisionWrite,
  type FixedWindowConsumeInput,
  type PublicApiKeyRepository,
  type SecurityAuditWrite,
  type StoredPublicApiKey,
} from "../modules/saas/application/public-api-key-service";

import type {
  PublicApiScope,
  TenantPlanLimits,
  TenantUsage,
} from "../modules/saas/domain/tenant-plan";

class MemoryRepository
  implements PublicApiKeyRepository {

  keys:
    StoredPublicApiKey[] = [];

  decisions:
    DeveloperDecisionWrite[] = [];

  audits:
    SecurityAuditWrite[] = [];

  private sequence = 0;

  async createApiKey(
    input: {
      workspaceId: string;
      name: string;
      prefix: string;
      sha256: string;
      scopes:
        readonly PublicApiScope[];
      expiresAt: Date | null;
      createdAt: Date;
    },
    audit:
      SecurityAuditWrite,
  ): Promise<StoredPublicApiKey> {
    this.sequence += 1;

    const row:
      StoredPublicApiKey = {
        id:
          `key-${this.sequence}`,

        workspaceId:
          input.workspaceId,

        name:
          input.name,

        prefix:
          input.prefix,

        sha256:
          input.sha256,

        scopes: [
          ...input.scopes,
        ],

        revokedAt: null,

        expiresAt:
          input.expiresAt,

        lastUsedAt: null,

        createdAt:
          input.createdAt,

        updatedAt:
          input.createdAt,
      };

    this.keys.push(row);

    this.audits.push({
      ...audit,
      entityId:
        row.id,
    });

    return row;
  }

  async listApiKeys(
    workspaceId: string,
  ): Promise<StoredPublicApiKey[]> {
    return this.keys
      .filter(
        (row) =>
          row.workspaceId ===
          workspaceId,
      )
      .map(
        (row) => ({
          ...row,
          scopes: [
            ...row.scopes,
          ],
        }),
      );
  }

  async findApiKeyBySha256(
    sha256: string,
  ): Promise<StoredPublicApiKey | null> {
    return (
      this.keys.find(
        (row) =>
          row.sha256 ===
          sha256,
      ) ??
      null
    );
  }

  async revokeApiKey(
    input: {
      workspaceId: string;
      keyId: string;
      revokedAt: Date;
    },
    audit:
      SecurityAuditWrite,
  ): Promise<StoredPublicApiKey | null> {
    const index =
      this.keys.findIndex(
        (row) =>
          row.id ===
            input.keyId &&
          row.workspaceId ===
            input.workspaceId,
      );

    if (index < 0) {
      return null;
    }

    const current =
      this.keys[index];

    const row:
      StoredPublicApiKey = {
        ...current,

        revokedAt:
          current.revokedAt
          ?? input.revokedAt,

        updatedAt:
          input.revokedAt,
      };

    this.keys[index] =
      row;

    this.audits.push({
      ...audit,
      entityId:
        row.id,
    });

    return row;
  }

  async recordDeniedDecision(
    input:
      DeveloperDecisionWrite,
  ): Promise<void> {
    this.decisions.push(
      input,
    );

    this.audits.push({
      workspaceId:
        input.workspaceId,

      action:
        "public-api.authenticate",

      actorId:
        input.apiKeyId
        ?? null,

      entityType:
        "PUBLIC_API_KEY",

      entityId:
        input.apiKeyId
        ?? null,

      outcome:
        "DENIED",

      reasonCode:
        input.reasonCode,

      requestId:
        input.requestId,

      correlationId:
        input.requestId,

      occurredAt:
        input.occurredAt,
    });
  }

  async consumeFixedWindow(
    input:
      FixedWindowConsumeInput,
  ): Promise<{
    allowed: boolean;
    remainingInWindow: number;
  }> {
    const used =
      this.decisions
        .filter(
          (row) =>
            row.workspaceId ===
              input.workspaceId &&
            row.apiKeyId ===
              input.apiKeyId &&
            row.rateLimitDecision ===
              "ALLOWED" &&
            row.occurredAt >=
              input.windowStart &&
            row.occurredAt <
              input.windowEnd,
        )
        .length;

    if (
      used >=
      input.windowLimit
    ) {
      await this
        .recordDeniedDecision({
          workspaceId:
            input.workspaceId,

          apiKeyId:
            input.apiKeyId,

          requestId:
            input.requestId,

          method:
            input.method,

          path:
            input.path,

          statusCode: 429,

          rateLimitDecision:
            "DENIED_RATE_LIMIT",

          ipHash:
            input.ipHash
            ?? null,

          userAgentHash:
            input.userAgentHash
            ?? null,

          allowed: false,

          reasonCode:
            "RATE_LIMIT_EXCEEDED",

          requiredScope:
            input.requiredScope,

          occurredAt:
            input.occurredAt,
        });

      return {
        allowed: false,
        remainingInWindow: 0,
      };
    }

    this.decisions.push({
      workspaceId:
        input.workspaceId,

      apiKeyId:
        input.apiKeyId,

      requestId:
        input.requestId,

      method:
        input.method,

      path:
        input.path,

      statusCode: 200,

      rateLimitDecision:
        "ALLOWED",

      ipHash:
        input.ipHash
        ?? null,

      userAgentHash:
        input.userAgentHash
        ?? null,

      allowed: true,

      reasonCode:
        "AUTHORIZED",

      requiredScope:
        input.requiredScope,

      occurredAt:
        input.occurredAt,
    });

    const index =
      this.keys.findIndex(
        (row) =>
          row.id ===
            input.apiKeyId &&
          row.workspaceId ===
            input.workspaceId,
      );

    if (index >= 0) {
      this.keys[index] = {
        ...this.keys[index],

        lastUsedAt:
          input.occurredAt,

        updatedAt:
          input.occurredAt,
      };
    }

    return {
      allowed: true,

      remainingInWindow:
        Math.max(
          0,
          input.windowLimit -
            used -
            1,
        ),
    };
  }
}

const LIMITS:
  TenantPlanLimits = {
    maxSeats: 25,
    maxConnections: 10,
    maxMonthlyOutbound:
      50_000,
    publicApiEnabled: true,
    whiteLabelEnabled:
      false,
  };

const USAGE:
  TenantUsage = {
    seats: 4,
    connections: 2,
    monthlyOutbound: 100,
  };

const T0 =
  new Date(
    "2026-09-11T12:00:00.000Z",
  );

async function createKey(
  repository:
    MemoryRepository,
  options?: {
    workspaceId?: string;
    scopes?:
      readonly PublicApiScope[];
    expiresAt?:
      Date | null;
    now?: Date;
  },
) {
  return createPublicApiKey(
    repository,
    {
      workspaceId:
        options?.workspaceId
        ?? "workspace-a",

      name:
        "Automation API",

      scopes:
        options?.scopes
        ?? ["analytics.read"],

      expiresAt:
        options?.expiresAt
        ?? null,

      actorId:
        "admin-1",

      requestId:
        `create-${repository.keys.length + 1}`,

      now:
        options?.now
        ?? T0,
    },
  );
}

async function authenticate(
  repository:
    MemoryRepository,
  input: {
    secret: string;
    requestId: string;
    workspaceId?: string;
    resourceWorkspaceId?: string;
    scope?: PublicApiScope;
    limits?:
      TenantPlanLimits;
    usage?:
      TenantUsage;
    windowLimit?: number;
    now?: Date;
  },
) {
  const workspaceId =
    input.workspaceId
    ?? "workspace-a";

  return authenticatePublicApiKey(
    repository,
    {
      secret:
        input.secret,

      activeWorkspaceId:
        workspaceId,

      resourceWorkspaceId:
        input.resourceWorkspaceId
        ?? workspaceId,

      requiredScope:
        input.scope
        ?? "analytics.read",

      limits:
        input.limits
        ?? LIMITS,

      projectedUsage:
        input.usage
        ?? USAGE,

      windowLimit:
        input.windowLimit
        ?? 100,

      windowMs:
        60_000,

      requestId:
        input.requestId,

      method: "GET",

      path:
        "/developer/analytics",

      ipAddress:
        "203.0.113.9",

      userAgent:
        "Phase16B-Test/1.0",

      now:
        input.now
        ?? T0,
    },
  );
}

async function main() {
  const repository =
    new MemoryRepository();

  const created =
    await createKey(
      repository,
    );

  assert.match(
    created.secret,
    /^sd_api_[A-Za-z0-9_-]+$/,
  );

  assert.equal(
    repository.keys[0]
      .sha256,
    hashApiKey(
      created.secret,
    ),
  );

  assert.notEqual(
    repository.keys[0]
      .sha256,
    created.secret,
  );

  assert.equal(
    "sha256" in
      created.apiKey,
    false,
  );

  assert.equal(
    "secret" in
      created.apiKey,
    false,
  );

  const listed =
    await listPublicApiKeys(
      repository,
      "workspace-a",
    );

  assert.equal(
    listed.length,
    1,
  );

  assert.equal(
    "sha256" in listed[0],
    false,
  );

  assert.equal(
    JSON.stringify(
      listed,
    ).includes(
      created.secret,
    ),
    false,
  );

  const allowed =
    await authenticate(
      repository,
      {
        secret:
          created.secret,

        requestId:
          "auth-allowed",
      },
    );

  assert.equal(
    allowed.allowed,
    true,
  );

  const firstDecision =
    repository.decisions[0];

  assert.equal(
    JSON.stringify(
      firstDecision,
    ).includes(
      "203.0.113.9",
    ),
    false,
  );

  assert.equal(
    JSON.stringify(
      firstDecision,
    ).includes(
      "Phase16B-Test/1.0",
    ),
    false,
  );

  assert.match(
    firstDecision.ipHash
      ?? "",
    /^[0-9a-f]{64}$/,
  );

  const crossTenant =
    await authenticate(
      repository,
      {
        secret:
          created.secret,

        workspaceId:
          "workspace-b",

        requestId:
          "auth-cross-tenant",
      },
    );

  assert.deepEqual(
    crossTenant,
    {
      allowed: false,
      reason:
        "tenant-scope-mismatch",
    },
  );

  assert.equal(
    repository
      .decisions[
        repository.decisions
          .length - 1
      ]
      .apiKeyId,
    null,
  );

  const scopeDenied =
    await authenticate(
      repository,
      {
        secret:
          created.secret,

        scope:
          "contacts.read",

        requestId:
          "auth-scope-denied",
      },
    );

  assert.deepEqual(
    scopeDenied,
    {
      allowed: false,
      reason:
        "scope-denied",
    },
  );

  const disabled =
    await authenticate(
      repository,
      {
        secret:
          created.secret,

        limits: {
          ...LIMITS,

          publicApiEnabled:
            false,
        },

        requestId:
          "auth-api-disabled",
      },
    );

  assert.deepEqual(
    disabled,
    {
      allowed: false,
      reason:
        "public-api-disabled",
    },
  );

  const overPlan =
    await authenticate(
      repository,
      {
        secret:
          created.secret,

        usage: {
          ...USAGE,

          monthlyOutbound:
            LIMITS
              .maxMonthlyOutbound +
            1,
        },

        requestId:
          "auth-over-plan",
      },
    );

  assert.deepEqual(
    overPlan,
    {
      allowed: false,
      reason:
        "plan-limit-exceeded",
    },
  );

  const rateKey =
    await createKey(
      repository,
    );

  const firstRate =
    await authenticate(
      repository,
      {
        secret:
          rateKey.secret,

        windowLimit: 1,

        requestId:
          "rate-1",

        now:
          new Date(
            "2026-09-11T12:01:05.000Z",
          ),
      },
    );

  assert.equal(
    firstRate.allowed,
    true,
  );

  const secondRate =
    await authenticate(
      repository,
      {
        secret:
          rateKey.secret,

        windowLimit: 1,

        requestId:
          "rate-2",

        now:
          new Date(
            "2026-09-11T12:01:20.000Z",
          ),
      },
    );

  assert.deepEqual(
    secondRate,
    {
      allowed: false,
      reason:
        "rate-limit-exceeded",
    },
  );

  const expiring =
    await createKey(
      repository,
      {
        expiresAt:
          new Date(
            "2026-09-11T12:05:00.000Z",
          ),

        now: T0,
      },
    );

  const expired =
    await authenticate(
      repository,
      {
        secret:
          expiring.secret,

        requestId:
          "auth-expired",

        now:
          new Date(
            "2026-09-11T12:06:00.000Z",
          ),
      },
    );

  assert.deepEqual(
    expired,
    {
      allowed: false,
      reason:
        "api-key-expired",
    },
  );

  const revocable =
    await createKey(
      repository,
    );

  await assert.rejects(
    () =>
      revokePublicApiKey(
        repository,
        {
          workspaceId:
            "workspace-b",

          keyId:
            revocable.apiKey.id,

          actorId:
            "admin-1",

          requestId:
            "revoke-wrong-workspace",

          now: T0,
        },
      ),

    /API key not found/,
  );

  const revoked =
    await revokePublicApiKey(
      repository,
      {
        workspaceId:
          "workspace-a",

        keyId:
          revocable.apiKey.id,

        actorId:
          "admin-1",

        requestId:
          "revoke-correct-workspace",

        now:
          new Date(
            "2026-09-11T12:10:00.000Z",
          ),
      },
    );

  assert.ok(
    revoked.revokedAt,
  );

  const revokedAuth =
    await authenticate(
      repository,
      {
        secret:
          revocable.secret,

        requestId:
          "auth-revoked",

        now:
          new Date(
            "2026-09-11T12:11:00.000Z",
          ),
      },
    );

  assert.deepEqual(
    revokedAuth,
    {
      allowed: false,
      reason:
        "api-key-revoked",
    },
  );

  const invalid =
    await authenticate(
      repository,
      {
        secret:
          "invalid",

        requestId:
          "auth-invalid",
      },
    );

  assert.deepEqual(
    invalid,
    {
      allowed: false,
      reason:
        "api-key-invalid",
    },
  );

  assert.equal(
    verifyApiKey(
      created.secret,
      {
        id: "broken",

        workspaceId:
          "workspace-a",

        sha256:
          "abcd",

        scopes: [
          "analytics.read",
        ],

        revoked: false,
      },

      T0,
    ),
    false,
  );

  const persistenceDump =
    JSON.stringify({
      keys:
        repository.keys,

      decisions:
        repository.decisions,

      audits:
        repository.audits,
    });

  for (
    const secret of [
      created.secret,
      rateKey.secret,
      expiring.secret,
      revocable.secret,
    ]
  ) {
    assert.equal(
      persistenceDump.includes(
        secret,
      ),
      false,
    );
  }

  const adapter =
    fs.readFileSync(
      "modules/saas/infrastructure/prisma-public-api-key-repository.ts",
      "utf8",
    );

  assert.match(
    adapter,
    /prisma\.\$transaction/,
  );

  assert.match(
    adapter,
    /pg_advisory_xact_lock/,
  );

  assert.match(
    adapter,
    /hashtextextended/,
  );

  assert.match(
    adapter,
    /engageDeveloperRequestLog/,
  );

  assert.match(
    adapter,
    /engageSecurityAuditEvent/,
  );

  assert.match(
    adapter,
    /rateLimitDecision:\s*"ALLOWED"/,
  );

  assert.doesNotMatch(
    adapter,
    /rawSecret|plaintextSecret/,
  );

  console.log(
    "EngageOS Phase 16B API-key runtime: PASS",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
