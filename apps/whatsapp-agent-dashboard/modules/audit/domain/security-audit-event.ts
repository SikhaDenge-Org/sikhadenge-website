import type {
  WorkspaceActorId,
  WorkspaceId,
} from "@/modules/workspaces/domain/workspace";

export type SecurityAuditAction =
  | "AUTHORIZATION_DENIED"
  | "OUTBOUND_BLOCKED"
  | "CREDENTIAL_VIEWED"
  | "KILL_SWITCH_ACTIVATED"
  | "KILL_SWITCH_DEACTIVATED"
  | "CONSENT_CHANGED"
  | "SUPPRESSION_CHANGED"
  | "WEBHOOK_REJECTED";

export type SecurityAuditOutcome = "SUCCESS" | "DENIED" | "FAILED";

export type SecurityAuditEvent = Readonly<{
  id: string;
  workspaceId: WorkspaceId;
  actorId?: WorkspaceActorId;
  action: SecurityAuditAction;
  outcome: SecurityAuditOutcome;
  entityType: string;
  entityId?: string;
  reasonCode?: string;
  requestId?: string;
  correlationId?: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
  occurredAt: Date;
}>;

const FORBIDDEN_METADATA_KEY_FRAGMENTS = [
  "token",
  "secret",
  "password",
  "authorization",
  "ciphertext",
  "rawpayload",
];

function normalizeMetadataKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function createSecurityAuditEvent(
  event: SecurityAuditEvent,
): SecurityAuditEvent {
  if (!event.id.trim()) throw new Error("audit event id is required.");
  if (!event.entityType.trim()) throw new Error("entityType is required.");
  if (Number.isNaN(event.occurredAt.getTime())) {
    throw new Error("occurredAt must be a valid date.");
  }

  for (const key of Object.keys(event.metadata ?? {})) {
    const normalized = normalizeMetadataKey(key);
    if (
      FORBIDDEN_METADATA_KEY_FRAGMENTS.some((fragment) =>
        normalized.includes(fragment),
      )
    ) {
      throw new Error(`Sensitive audit metadata key is not allowed: ${key}.`);
    }
  }

  return Object.freeze({
    ...event,
    metadata: event.metadata
      ? Object.freeze({ ...event.metadata })
      : undefined,
  });
}
