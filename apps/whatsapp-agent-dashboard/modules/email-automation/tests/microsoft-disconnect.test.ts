import assert from "node:assert/strict";

import { EmailConnectionService } from "../application/connection-service";
import type { EmailConnection } from "../domain/contracts";
import { EmailProviderRegistry } from "../providers/provider-registry";

const connection: EmailConnection = {
  id: "connection-ms-1",
  workspaceId: "workspace-1",
  provider: "MICROSOFT_365",
  displayName: "Microsoft 365",
  externalAccountId: "user-1",
  status: "CONNECTED",
  connectedAt: new Date("2026-09-18T00:00:00Z"),
  lastVerifiedAt: new Date("2026-09-18T00:00:00Z"),
  revokedAt: null,
};

let adapterRevokeCalled = false;
let vaultRevokeCalled = false;
const saved: EmailConnection[] = [];

const providers = new EmailProviderRegistry();
providers.register({
  provider: "MICROSOFT_365",
  startOAuth: async () => { throw new Error("unused"); },
  completeOAuth: async () => { throw new Error("unused"); },
  verifyConnection: async () => { throw new Error("unused"); },
  listSenderIdentities: async () => [],
  sendMessage: async () => { throw new Error("unused"); },
  revoke: async (target) => {
    assert.equal(target.id, connection.id);
    adapterRevokeCalled = true;
  },
});

const service = new EmailConnectionService({
  providers,
  connections: {
    listByWorkspace: async () => [connection],
    getById: async () => connection,
    save: async (value: EmailConnection) => {
      saved.push(value);
      return value;
    },
  } as never,
  senders: {} as never,
  credentials: {
    storeOAuthCredentials: async () => {},
    loadOAuthCredentials: async () => null,
    hasUsableCredentials: async () => true,
    revokeCredentials: async (target) => {
      assert.equal(target.connectionId, connection.id);
      assert.equal(target.workspaceId, connection.workspaceId);
      vaultRevokeCalled = true;
    },
  },
  now: () => new Date("2026-09-18T04:00:00Z"),
});

async function main() {
  await service.revoke({ workspaceId: connection.workspaceId, connectionId: connection.id });

  assert.equal(adapterRevokeCalled, true);
  assert.equal(vaultRevokeCalled, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, "REVOKED");
  assert.equal(saved[0].revokedAt?.toISOString(), "2026-09-18T04:00:00.000Z");

  console.log("Microsoft 365 app-scoped disconnect contract: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
