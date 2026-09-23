import assert from "node:assert/strict";

import type { EmailConnection, EmailSenderIdentity } from "../domain/contracts";
import {
  emailProviderFailoverPolicyFromEnv,
  selectEmailProviderRoute,
} from "../providers/routing/failover-policy";

const gmail: EmailSenderIdentity = {
  id: "sender-gmail",
  workspaceId: "workspace-e8",
  connectionId: "connection-gmail",
  provider: "GOOGLE_GMAIL",
  fromName: "Gmail Sender",
  fromEmail: "gmail@example.com",
  replyToEmail: null,
  externalSenderId: "gmail@example.com",
  verificationStatus: "VERIFIED",
  isProviderDefault: true,
  isWorkspaceDefault: true,
  isActive: true,
  dailyLimit: null,
};

const microsoft: EmailSenderIdentity = {
  ...gmail,
  id: "sender-ms",
  connectionId: "connection-ms",
  provider: "MICROSOFT_365",
  fromName: "Microsoft Sender",
  fromEmail: "ms@example.com",
  externalSenderId: "ms@example.com",
  isWorkspaceDefault: false,
};

function connection(sender: EmailSenderIdentity, status: EmailConnection["status"] = "CONNECTED"): EmailConnection {
  return {
    id: sender.connectionId,
    workspaceId: sender.workspaceId,
    provider: sender.provider,
    displayName: sender.fromEmail,
    externalAccountId: sender.externalSenderId,
    status,
    connectedAt: new Date("2026-09-23T06:00:00.000Z"),
    lastVerifiedAt: new Date("2026-09-23T06:00:00.000Z"),
    revokedAt: null,
  };
}

function main() {
  const disabled = emailProviderFailoverPolicyFromEnv({
    NODE_ENV: "test",
    EMAIL_PROVIDER_FAILOVER_ENABLED: "false",
    EMAIL_PROVIDER_FAILOVER_ORDER: "MICROSOFT_365,GOOGLE_GMAIL",
  });
  const primary = selectEmailProviderRoute({
    policy: disabled,
    primary: gmail,
    senders: [gmail, microsoft],
    connections: [connection(gmail), connection(microsoft)],
    registeredProviders: ["GOOGLE_GMAIL", "MICROSOFT_365"],
  });
  assert.equal(primary?.sender.id, gmail.id);
  assert.equal(primary?.failoverUsed, false);

  const enabled = emailProviderFailoverPolicyFromEnv({
    NODE_ENV: "test",
    EMAIL_PROVIDER_FAILOVER_ENABLED: "true",
    EMAIL_PROVIDER_FAILOVER_ORDER: "MICROSOFT_365,MICROSOFT_365,GOOGLE_GMAIL,INVALID",
  });
  assert.deepEqual(enabled.orderedProviders, ["MICROSOFT_365", "GOOGLE_GMAIL"]);

  const fallback = selectEmailProviderRoute({
    policy: enabled,
    primary: gmail,
    senders: [gmail, microsoft],
    connections: [connection(gmail, "DEGRADED"), connection(microsoft)],
    registeredProviders: ["GOOGLE_GMAIL", "MICROSOFT_365"],
  });
  assert.equal(fallback?.sender.id, microsoft.id);
  assert.equal(fallback?.connection.id, microsoft.connectionId);
  assert.equal(fallback?.failoverUsed, true);

  const unregistered = selectEmailProviderRoute({
    policy: enabled,
    primary: gmail,
    senders: [gmail, microsoft],
    connections: [connection(gmail, "DEGRADED"), connection(microsoft)],
    registeredProviders: ["GOOGLE_GMAIL"],
  });
  assert.equal(unregistered, null, "unregistered fallback adapters must fail closed");

  const crossWorkspaceMicrosoft: EmailSenderIdentity = {
    ...microsoft,
    id: "sender-ms-other-workspace",
    workspaceId: "workspace-other",
  };
  const crossWorkspace = selectEmailProviderRoute({
    policy: enabled,
    primary: gmail,
    senders: [gmail, crossWorkspaceMicrosoft],
    connections: [connection(gmail, "DISCONNECTED"), connection(crossWorkspaceMicrosoft)],
    registeredProviders: ["GOOGLE_GMAIL", "MICROSOFT_365"],
  });
  assert.equal(crossWorkspace, null, "provider routing must never cross workspace boundaries");

  const inactiveMicrosoft = { ...microsoft, isActive: false };
  const inactive = selectEmailProviderRoute({
    policy: enabled,
    primary: gmail,
    senders: [gmail, inactiveMicrosoft],
    connections: [connection(gmail, "EXPIRED"), connection(inactiveMicrosoft)],
    registeredProviders: ["GOOGLE_GMAIL", "MICROSOFT_365"],
  });
  assert.equal(inactive, null, "inactive fallback senders must fail closed");

  console.log("Email E8 provider routing and failover policy: PASS");
}

main();
