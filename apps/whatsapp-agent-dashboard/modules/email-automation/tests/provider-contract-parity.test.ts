import assert from "node:assert/strict";

import type { EmailConnection, EmailProvider, EmailSendRequest } from "../domain/contracts";
import { GmailEmailProviderAdapter } from "../providers/gmail/gmail-adapter";
import { Microsoft365EmailProviderAdapter } from "../providers/microsoft/microsoft-adapter";
import type { EmailCredentialVaultPort, EmailProviderAdapter } from "../providers/provider-contract";
import { EmailProviderRegistry } from "../providers/provider-registry";

const vault: EmailCredentialVaultPort = {
  storeOAuthCredentials: async () => {},
  loadOAuthCredentials: async () => null,
  hasUsableCredentials: async () => false,
  revokeCredentials: async () => {},
};

const now = () => new Date("2026-09-23T06:00:00.000Z");
const oauthSecret = "e8-contract-secret-0123456789abcdef-0123456789abcdef";
const adapters: readonly EmailProviderAdapter[] = [
  new GmailEmailProviderAdapter(
    { clientId: "gmail-client", clientSecret: "gmail-secret", oauthStateSecret: oauthSecret },
    vault,
    now,
  ),
  new Microsoft365EmailProviderAdapter(
    { clientId: "ms-client", clientSecret: "ms-secret", tenantId: "tenant-1", oauthStateSecret: oauthSecret },
    vault,
    now,
  ),
];

function connection(provider: EmailProvider): EmailConnection {
  return {
    id: `connection-${provider.toLowerCase()}`,
    workspaceId: "workspace-e8",
    provider,
    displayName: provider,
    externalAccountId: `account-${provider.toLowerCase()}`,
    status: "CONNECTED",
    connectedAt: now(),
    lastVerifiedAt: now(),
    revokedAt: null,
  };
}

function sendRequest(connectionId: string): EmailSendRequest {
  return {
    workspaceId: "workspace-e8",
    connectionId,
    senderIdentityId: "sender-e8",
    from: { email: "sender@example.com", name: "Sender" },
    to: [{ email: "recipient@example.com" }],
    rendered: {
      subject: "E8 contract",
      html: "<p>E8 contract</p>",
      text: "E8 contract",
      variables: {},
    },
    idempotencyKey: "e8-contract-001",
  };
}

async function runContract(adapter: EmailProviderAdapter) {
  for (const method of ["startOAuth", "completeOAuth", "verifyConnection", "listSenderIdentities", "sendMessage", "revoke"] as const) {
    assert.equal(typeof adapter[method], "function", `${adapter.provider}.${method} must implement the shared provider contract`);
  }

  const oauth = await adapter.startOAuth({
    workspaceId: "workspace-e8",
    redirectUri: `https://dashboard.sikhadenge.in/api/email/${adapter.provider.toLowerCase()}/callback`,
  });
  assert.equal(oauth.provider, adapter.provider);
  assert.equal(new URL(oauth.authorizationUrl).protocol, "https:");
  assert.ok(oauth.state.length > 20);

  const target = connection(adapter.provider);
  const health = await adapter.verifyConnection(target);
  assert.equal(health.provider, adapter.provider);
  assert.equal(health.connected, false);
  assert.equal(health.externalWriteSent, false);
  assert.equal(health.checkedAt.toISOString(), now().toISOString());

  await adapter.revoke(target);
  await assert.rejects(
    () => adapter.sendMessage(sendRequest(target.id)),
    /external writes are disabled/i,
  );
}

async function main() {
  const previous = {
    runtimeEnabled: process.env.EMAIL_RUNTIME_ENABLED,
    externalWrites: process.env.EMAIL_EXTERNAL_WRITES_ENABLED,
    mode: process.env.EMAIL_RUNTIME_MODE,
  };
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  process.env.EMAIL_RUNTIME_ENABLED = "true";
  process.env.EMAIL_EXTERNAL_WRITES_ENABLED = "false";
  process.env.EMAIL_RUNTIME_MODE = "DRY_RUN";
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("Provider contract suite must not make a network request.");
  }) as typeof fetch;

  try {
    const registry = new EmailProviderRegistry();
    for (const adapter of adapters) {
      await runContract(adapter);
      registry.register(adapter);
    }

    assert.deepEqual(registry.list(), ["GOOGLE_GMAIL", "MICROSOFT_365"]);
    assert.equal(registry.get("GOOGLE_GMAIL").provider, "GOOGLE_GMAIL");
    assert.equal(registry.get("MICROSOFT_365").provider, "MICROSOFT_365");
    assert.throws(() => registry.register(adapters[0]), /already registered/i);
    assert.equal(fetchCalls, 0, "DRY_RUN contract parity must not produce provider network writes");
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.runtimeEnabled === undefined) delete process.env.EMAIL_RUNTIME_ENABLED;
    else process.env.EMAIL_RUNTIME_ENABLED = previous.runtimeEnabled;
    if (previous.externalWrites === undefined) delete process.env.EMAIL_EXTERNAL_WRITES_ENABLED;
    else process.env.EMAIL_EXTERNAL_WRITES_ENABLED = previous.externalWrites;
    if (previous.mode === undefined) delete process.env.EMAIL_RUNTIME_MODE;
    else process.env.EMAIL_RUNTIME_MODE = previous.mode;
  }

  console.log("Email E8 Gmail/Microsoft shared provider contract parity: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
