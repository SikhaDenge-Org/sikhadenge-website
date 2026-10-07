import { createHash, timingSafeEqual } from "node:crypto";

import {
  apiKeyAllows,
  assertTenantScope,
  assertUsageWithinPlan,
  type PublicApiScope,
  type TenantPlanLimits,
  type TenantUsage,
} from "@/modules/saas/domain/tenant-plan";

export type ApiKeyRecord = {
  id: string;
  workspaceId: string;
  sha256: string;
  scopes: readonly PublicApiScope[];
  revoked: boolean;
  expiresAt?: Date | null;
};

export function hashApiKey(secret: string): string {
  const cleaned = secret.trim();

  if (cleaned.length < 20) {
    throw new Error("API key secret is too short.");
  }

  return createHash("sha256")
    .update(cleaned)
    .digest("hex");
}

export function verifyApiKey(
  secret: string,
  record: ApiKeyRecord,
  now: Date = new Date(),
): boolean {
  if (record.revoked) {
    return false;
  }

  if (
    record.expiresAt &&
    record.expiresAt.getTime() <= now.getTime()
  ) {
    return false;
  }

  const storedDigest = record.sha256.trim();

  if (!/^[0-9a-f]{64}$/.test(storedDigest)) {
    return false;
  }

  let actual: Buffer;
  let expected: Buffer;

  try {
    actual = Buffer.from(
      hashApiKey(secret),
      "hex",
    );

    expected = Buffer.from(
      storedDigest,
      "hex",
    );
  } catch {
    return false;
  }

  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

export function evaluateFixedWindowRateLimit(input: {
  used: number;
  limit: number;
}): {
  allowed: boolean;
  remaining: number;
} {
  if (
    !Number.isInteger(input.used) ||
    input.used < 0 ||
    !Number.isInteger(input.limit) ||
    input.limit < 1
  ) {
    throw new Error("Rate-limit counters are invalid.");
  }

  return {
    allowed: input.used < input.limit,
    remaining: Math.max(
      0,
      input.limit - input.used,
    ),
  };
}

export function assertEnterpriseAccess(input: {
  activeWorkspaceId: string;
  resourceWorkspaceId: string;
  secret: string;
  apiKey: ApiKeyRecord;
  requiredScope: PublicApiScope;
  limits: TenantPlanLimits;
  projectedUsage: TenantUsage;
  now?: Date;
}): void {
  assertTenantScope(
    input.activeWorkspaceId,
    input.resourceWorkspaceId,
  );

  assertTenantScope(
    input.activeWorkspaceId,
    input.apiKey.workspaceId,
  );

  if (!input.limits.publicApiEnabled) {
    throw new Error(
      "Public API is disabled for this plan.",
    );
  }

  if (
    !verifyApiKey(
      input.secret,
      input.apiKey,
      input.now ?? new Date(),
    )
  ) {
    throw new Error(
      "API key verification failed.",
    );
  }

  if (
    !apiKeyAllows(
      input.apiKey.scopes,
      input.requiredScope,
    )
  ) {
    throw new Error(
      "API key scope denied.",
    );
  }

  assertUsageWithinPlan(
    input.limits,
    input.projectedUsage,
  );
}

export function authorizeEnterpriseRequest(input: {
  activeWorkspaceId: string;
  resourceWorkspaceId: string;
  secret: string;
  apiKey: ApiKeyRecord;
  requiredScope: PublicApiScope;
  limits: TenantPlanLimits;
  projectedUsage: TenantUsage;
  windowUsed: number;
  windowLimit: number;
  now?: Date;
}): {
  allowed: true;
  remainingInWindow: number;
} {
  assertEnterpriseAccess(input);

  const rate =
    evaluateFixedWindowRateLimit({
      used: input.windowUsed,
      limit: input.windowLimit,
    });

  if (!rate.allowed) {
    throw new Error(
      "API rate limit exceeded.",
    );
  }

  return {
    allowed: true,
    remainingInWindow:
      rate.remaining - 1,
  };
}
