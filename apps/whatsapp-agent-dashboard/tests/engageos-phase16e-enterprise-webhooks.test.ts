import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createEnterpriseWebhookEndpoint,
  listEnterpriseWebhookEndpoints,
  pauseEnterpriseWebhookEndpoint,
  prepareEnterpriseWebhookDelivery,
  revokeEnterpriseWebhookEndpoint,
  verifyEnterpriseWebhookDelivery,
  type EnterpriseWebhookRepository,
  type StoredOutboundWebhookEndpoint,
  type WebhookDeveloperLogWrite,
  type WebhookSecurityAuditWrite,
} from "../modules/saas/application/enterprise-webhook-service";
import {
  decryptWebhookSecret,
} from "../modules/saas/infrastructure/webhook-secret-crypto";

class MemoryRepository implements EnterpriseWebhookRepository {
  endpoints = new Map<string, StoredOutboundWebhookEndpoint>();
  audits: WebhookSecurityAuditWrite[] = [];
  logs: WebhookDeveloperLogWrite[] = [];

  private key(workspaceId: string, endpointId: string) {
    return `${workspaceId}:${endpointId}`;
  }

  async createEndpoint(
    input: Parameters<EnterpriseWebhookRepository["createEndpoint"]>[0],
    audit: WebhookSecurityAuditWrite,
  ) {
    const row: StoredOutboundWebhookEndpoint = {
      id: input.id,
      workspaceId: input.workspaceId,
      name: input.name,
      url: input.url,
      events: [...input.events],
      status: "ACTIVE",
      keyVersion: input.encryptedSecret.keyVersion,
      pausedAt: null,
      revokedAt: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      encryptedSecret: { ...input.encryptedSecret },
    };
    this.endpoints.set(this.key(row.workspaceId, row.id), row);
    this.audits.push({ ...audit, entityId: row.id });
    return row;
  }

  async listEndpoints(workspaceId: string) {
    return [...this.endpoints.values()].filter(
      (endpoint) => endpoint.workspaceId === workspaceId,
    );
  }

  async findEndpoint(workspaceId: string, endpointId: string) {
    return this.endpoints.get(this.key(workspaceId, endpointId)) ?? null;
  }

  async setEndpointStatus(
    input: Parameters<EnterpriseWebhookRepository["setEndpointStatus"]>[0],
    audit: WebhookSecurityAuditWrite,
  ) {
    const key = this.key(input.workspaceId, input.endpointId);
    const current = this.endpoints.get(key);
    if (!current) return null;
    if (current.status === "REVOKED" && input.status !== "REVOKED") {
      throw new Error("Revoked webhook endpoints cannot be reactivated.");
    }
    const updated: StoredOutboundWebhookEndpoint = {
      ...current,
      status: input.status,
      pausedAt: input.status === "PAUSED" ? input.changedAt : current.pausedAt,
      revokedAt: input.status === "REVOKED" ? input.changedAt : current.revokedAt,
      updatedAt: input.changedAt,
    };
    this.endpoints.set(key, updated);
    this.audits.push({ ...audit, entityId: updated.id });
    return updated;
  }

  async recordDeveloperLog(input: WebhookDeveloperLogWrite) {
    this.logs.push({
      ...input,
      metadata: input.metadata ? { ...input.metadata } : undefined,
    });
  }
}

async function main() {
  const repository = new MemoryRepository();
  const encryptionKey = Buffer.alloc(32, 7);
  const now = new Date("2026-09-12T14:15:00.000Z");

  const created = await createEnterpriseWebhookEndpoint(repository, {
    workspaceId: "workspace-a",
    actorId: "user-a",
    requestId: "request-create-a",
    name: " Enrollment Events ",
    url: "https://Hooks.Example.com/engage?source=sikhadenge",
    events: ["lead.enrolled", "lead.enrolled", "Payment.Succeeded"],
    encryptionKey,
    keyVersion: "phase16e-k1",
    now,
  });

  assert.equal(created.endpoint.workspaceId, "workspace-a");
  assert.equal(created.endpoint.name, "Enrollment Events");
  assert.equal(created.endpoint.status, "ACTIVE");
  assert.deepEqual(created.endpoint.events, ["lead.enrolled", "payment.succeeded"]);
  assert.ok(created.signingSecret.length >= 32);
  assert.ok(!("encryptedSecret" in created.endpoint));

  const stored = await repository.findEndpoint("workspace-a", created.endpoint.id);
  assert.ok(stored);
  assert.notEqual(stored.encryptedSecret.ciphertext, created.signingSecret);
  assert.ok(!JSON.stringify(stored.encryptedSecret).includes(created.signingSecret));
  assert.equal(
    decryptWebhookSecret({
      encrypted: stored.encryptedSecret,
      key: encryptionKey,
      expectedKeyVersion: "phase16e-k1",
    }),
    created.signingSecret,
  );

  const safeList = await listEnterpriseWebhookEndpoints(repository, "workspace-a");
  assert.equal(safeList.length, 1);
  assert.ok(!("encryptedSecret" in safeList[0]));
  assert.equal((await listEnterpriseWebhookEndpoints(repository, "workspace-b")).length, 0);

  const body = JSON.stringify({ event: "lead.enrolled", leadId: "lead-123" });
  const prepared = await prepareEnterpriseWebhookDelivery(repository, {
    workspaceId: "workspace-a",
    endpointId: created.endpoint.id,
    requestId: "request-prepare-a",
    body,
    encryptionKey,
    expectedKeyVersion: "phase16e-k1",
    now,
  });

  const timestamp = Number(prepared.headers["x-sikhadenge-webhook-timestamp"]);
  const signature = prepared.headers["x-sikhadenge-webhook-signature"];
  assert.match(signature, /^[0-9a-f]{64}$/);
  assert.equal(
    await verifyEnterpriseWebhookDelivery(repository, {
      workspaceId: "workspace-a",
      endpointId: created.endpoint.id,
      timestamp,
      body,
      signature,
      encryptionKey,
      expectedKeyVersion: "phase16e-k1",
      now: now.getTime(),
    }),
    true,
  );
  assert.equal(
    await verifyEnterpriseWebhookDelivery(repository, {
      workspaceId: "workspace-a",
      endpointId: created.endpoint.id,
      timestamp: now.getTime() - 10 * 60 * 1000,
      body,
      signature,
      encryptionKey,
      expectedKeyVersion: "phase16e-k1",
      now: now.getTime(),
      replayWindowMs: 5 * 60 * 1000,
    }),
    false,
  );
  assert.equal(
    await verifyEnterpriseWebhookDelivery(repository, {
      workspaceId: "workspace-b",
      endpointId: created.endpoint.id,
      timestamp,
      body,
      signature,
      encryptionKey,
      now: now.getTime(),
    }),
    false,
  );

  await pauseEnterpriseWebhookEndpoint(repository, {
    workspaceId: "workspace-a",
    endpointId: created.endpoint.id,
    requestId: "request-pause-a",
    now: new Date(now.getTime() + 1_000),
  });
  await assert.rejects(
    () => prepareEnterpriseWebhookDelivery(repository, {
      workspaceId: "workspace-a",
      endpointId: created.endpoint.id,
      requestId: "request-paused-prepare",
      body,
      encryptionKey,
      now: new Date(now.getTime() + 2_000),
    }),
    /not active/,
  );

  const second = await createEnterpriseWebhookEndpoint(repository, {
    workspaceId: "workspace-a",
    name: "Lifecycle Events",
    url: "https://hooks.example.com/lifecycle",
    events: ["contact.updated"],
    encryptionKey,
    keyVersion: "phase16e-k1",
    now: new Date(now.getTime() + 3_000),
  });
  await revokeEnterpriseWebhookEndpoint(repository, {
    workspaceId: "workspace-a",
    endpointId: second.endpoint.id,
    requestId: "request-revoke-a",
    now: new Date(now.getTime() + 4_000),
  });
  await assert.rejects(
    () => prepareEnterpriseWebhookDelivery(repository, {
      workspaceId: "workspace-a",
      endpointId: second.endpoint.id,
      requestId: "request-revoked-prepare",
      body,
      encryptionKey,
      now: new Date(now.getTime() + 5_000),
    }),
    /not active/,
  );
  await assert.rejects(
    () => pauseEnterpriseWebhookEndpoint(repository, {
      workspaceId: "workspace-b",
      endpointId: second.endpoint.id,
    }),
    /not found in this workspace/,
  );

  assert.ok(repository.logs.some((entry) => entry.decision === "SIGNED_NO_NETWORK_DELIVERY"));
  assert.ok(repository.logs.some((entry) => entry.decision === "DENIED_PAUSED"));
  assert.ok(repository.logs.some((entry) => entry.decision === "DENIED_REVOKED"));
  assert.ok(
    !JSON.stringify({ audits: repository.audits, logs: repository.logs, safeList })
      .includes(created.signingSecret),
  );

  await assert.rejects(
    () => createEnterpriseWebhookEndpoint(repository, {
      workspaceId: "workspace-a",
      name: "Unsafe",
      url: "http://127.0.0.1/hook",
      events: ["unsafe.event"],
      encryptionKey,
      keyVersion: "phase16e-k1",
    }),
    /credential-free HTTPS URL|host is not allowed/,
  );

  const migration = fs.readFileSync(
    new URL(
      "../prisma/migrations/20260912194000_add_phase16e_enterprise_webhooks/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /EngageOutboundWebhookEndpoint/);
  assert.match(migration, /AES_256_GCM/);
  assert.match(migration, /FOREIGN KEY \("workspaceId"\)/);
  assert.ok(!migration.includes("signingSecret"));
  assert.ok(!migration.includes("secretPlaintext"));

  console.log("Phase 16E enterprise webhook controls passed.");
}

void main();
