import { execFileSync } from "node:child_process";

import { prisma } from "@/lib/db/prisma";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function present(name: string): boolean { return Boolean(process.env[name]?.trim()); }
function flag(name: string): boolean { return process.env[name]?.trim().toLowerCase() === "true"; }
function gmailInbound(value: unknown) { return asRecord(asRecord(value).gmailInbound); }

async function main() {
  const expected = process.env.EXPECTED_RELEASE_SHA?.trim() || "";
  if (!/^[0-9a-f]{40}$/.test(expected)) throw new Error("EXPECTED_RELEASE_SHA is required.");
  const current = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (current !== expected) throw new Error("Deployed git SHA does not match EXPECTED_RELEASE_SHA.");

  const connections = await prisma.engageChannelConnection.findMany({
    where: { channel: "EMAIL", status: "CONNECTED" },
    select: { id: true, workspaceId: true, externalAccountId: true, capabilities: true },
    orderBy: { createdAt: "asc" },
  });
  const gmail = connections.filter((row) => asRecord(row.capabilities).emailProvider === "GOOGLE_GMAIL");
  const watched = gmail.filter((row) => typeof gmailInbound(row.capabilities).historyId === "string" && String(gmailInbound(row.capabilities).historyId).trim());
  const inboundCount = await prisma.engageEmailInboundMessage.count();
  const unmatchedInboundCount = await prisma.engageEmailInboundMessage.count({ where: { contactId: null, classification: "INBOUND" } });

  const checks = {
    gmailClientId: present("GOOGLE_GMAIL_CLIENT_ID"),
    gmailClientSecret: present("GOOGLE_GMAIL_CLIENT_SECRET"),
    gmailOauthStateSecret: (process.env.GOOGLE_GMAIL_OAUTH_STATE_SECRET?.trim().length ?? 0) >= 32,
    credentialEncryptionKey: present("EMAIL_CREDENTIAL_ENCRYPTION_KEY_B64"),
    pubSubTopic: present("GOOGLE_GMAIL_PUBSUB_TOPIC"),
    schedulerToken: (process.env.EMAIL_AUTOMATION_SCHEDULER_TOKEN?.trim().length ?? 0) >= 32,
  };
  const configReady = Object.values(checks).every(Boolean) && gmail.length > 0;
  const evidence = {
    status: configReady ? "READY" : "BLOCKED",
    deployedSha: current,
    inboundSyncEnabled: flag("EMAIL_INBOUND_SYNC_ENABLED"),
    runtimeMode: process.env.EMAIL_RUNTIME_MODE?.trim() || "DISABLED",
    externalWritesEnabled: flag("EMAIL_EXTERNAL_WRITES_ENABLED"),
    checks,
    connectedEmailConnections: connections.length,
    connectedGmailConnections: gmail.length,
    watchedGmailConnections: watched.length,
    inboundMessages: inboundCount,
    unmatchedInboundMessages: unmatchedInboundCount,
    gmailAccounts: gmail.map((row) => ({ workspaceId: row.workspaceId, connectionId: row.id, account: row.externalAccountId, watchCursorPresent: watched.some((item) => item.id === row.id) })),
  };
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (!configReady) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Email inbound readiness audit failed.");
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
