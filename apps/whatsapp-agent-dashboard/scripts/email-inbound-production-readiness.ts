import { execFileSync } from "node:child_process";

import { prisma } from "@/lib/db/prisma";
import { buildEmailE1Runtime } from "@/modules/email-automation/infrastructure/runtime";
import { GmailEmailProviderAdapter } from "@/modules/email-automation/providers/gmail/gmail-adapter";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function present(name: string): boolean { return Boolean(process.env[name]?.trim()); }
function flag(name: string): boolean { return process.env[name]?.trim().toLowerCase() === "true"; }
function gmailInbound(value: unknown) { return asRecord(asRecord(value).gmailInbound); }
type Sender = { fromEmail?: unknown; verificationStatus?: unknown; isActive?: unknown };

async function main() {
  const expected = process.env.EXPECTED_RELEASE_SHA?.trim() || "";
  const activationAccount = (process.env.EMAIL_INBOUND_ACTIVATION_ACCOUNT?.trim() || "support@sikhadenge.in").toLowerCase();
  const activationWorkspaceId = process.env.EMAIL_INBOUND_ACTIVATION_WORKSPACE_ID?.trim() || "engagews_default";
  if (!/^[0-9a-f]{40}$/.test(expected)) throw new Error("EXPECTED_RELEASE_SHA is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(activationAccount)) throw new Error("EMAIL_INBOUND_ACTIVATION_ACCOUNT is invalid.");
  if (!/^[A-Za-z0-9_-]+$/.test(activationWorkspaceId)) throw new Error("EMAIL_INBOUND_ACTIVATION_WORKSPACE_ID is invalid.");
  const current = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (current !== expected) throw new Error("Deployed git SHA does not match EXPECTED_RELEASE_SHA.");

  const inboundMode = (process.env.EMAIL_GMAIL_INBOUND_MODE?.trim().toUpperCase() || "POLLING");
  const inboundModeValid = inboundMode === "POLLING" || inboundMode === "WATCH";
  const connections = await prisma.engageChannelConnection.findMany({
    where: { workspaceId: activationWorkspaceId, channel: "EMAIL", status: "CONNECTED" },
    select: { id: true, workspaceId: true, displayName: true, externalAccountId: true, capabilities: true },
    orderBy: { createdAt: "asc" },
  });
  const gmail = connections.filter((row) => asRecord(row.capabilities).emailProvider === "GOOGLE_GMAIL");
  const activationMatches = gmail.filter((connection) => {
    if ((connection.displayName ?? "").trim().toLowerCase() !== activationAccount) return false;
    const metadata = asRecord(asRecord(connection.capabilities).emailAutomation);
    const senders = Array.isArray(metadata.senderIdentities) ? metadata.senderIdentities : [];
    return senders.some((raw) => {
      const sender = asRecord(raw) as Sender;
      return typeof sender.fromEmail === "string" &&
        sender.fromEmail.trim().toLowerCase() === activationAccount &&
        sender.verificationStatus === "VERIFIED" &&
        sender.isActive === true;
    });
  });
  const cursorReady = gmail.filter((row) => typeof gmailInbound(row.capabilities).historyId === "string" && String(gmailInbound(row.capabilities).historyId).trim());
  const activationCursorReady = activationMatches.filter((row) => typeof gmailInbound(row.capabilities).historyId === "string" && String(gmailInbound(row.capabilities).historyId).trim());
  const inboundCount = await prisma.engageEmailInboundMessage.count();
  const unmatchedInboundCount = await prisma.engageEmailInboundMessage.count({ where: { contactId: null, classification: "INBOUND" } });

  let gmailInboundAccess: { ok: boolean; status: number; emailAddress?: string; historyId?: string; error: string } = { ok: false, status: 0, error: "activation account connection not uniquely resolved" };
  let gmailHistoryReadAccess: { ok: boolean; status: number; error: string } = { ok: false, status: 0, error: "Gmail profile read access is not ready." };
  if (activationMatches.length === 1) {
    try {
      const runtime = buildEmailE1Runtime();
      const adapter = runtime.providers.get("GOOGLE_GMAIL");
      if (!(adapter instanceof GmailEmailProviderAdapter)) throw new Error("Gmail provider is unavailable.");
      const connection = activationMatches[0];
      const token = await adapter.getAccessTokenForConnection(connection.workspaceId, connection.id);
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const profile = response.ok ? await response.json() as { emailAddress?: string; historyId?: string } : null;
      const profileEmail = profile?.emailAddress?.trim().toLowerCase() || "";
      const profileHistoryId = profile?.historyId?.trim() || "";
      const mailboxMatches = response.ok && profileEmail === activationAccount && Boolean(profileHistoryId);
      gmailInboundAccess = {
        ok: mailboxMatches,
        status: response.status,
        emailAddress: profileEmail,
        historyId: profileHistoryId,
        error: !response.ok
          ? `Gmail profile probe returned HTTP ${response.status}`
          : profileEmail !== activationAccount
            ? `Authenticated Gmail mailbox ${profileEmail || "unknown"} does not match activation account ${activationAccount}.`
            : !profileHistoryId
              ? "Gmail profile did not include a historyId."
              : "",
      };

      if (gmailInboundAccess.ok) {
        try {
          const historyUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
          historyUrl.searchParams.set("startHistoryId", profileHistoryId);
          historyUrl.searchParams.set("historyTypes", "messageAdded");
          historyUrl.searchParams.set("maxResults", "1");
          const historyResponse = await fetch(historyUrl, {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          gmailHistoryReadAccess = {
            ok: historyResponse.ok,
            status: historyResponse.status,
            error: historyResponse.ok ? "" : `Gmail history.list probe returned HTTP ${historyResponse.status}`,
          };
        } catch (error) {
          gmailHistoryReadAccess = {
            ok: false,
            status: 0,
            error: error instanceof Error ? `Gmail history.list probe failed: ${error.message}` : "Gmail history.list probe failed.",
          };
        }
      }
    } catch (error) {
      gmailInboundAccess = {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : "Gmail inbound access probe failed.",
      };
    }
  }

  const checks = {
    gmailClientId: present("GOOGLE_GMAIL_CLIENT_ID"),
    gmailClientSecret: present("GOOGLE_GMAIL_CLIENT_SECRET"),
    gmailOauthStateSecret: (process.env.GOOGLE_GMAIL_OAUTH_STATE_SECRET?.trim().length ?? 0) >= 32,
    credentialEncryptionKey: present("EMAIL_CREDENTIAL_ENCRYPTION_KEY_B64"),
    pubSubTopic: present("GOOGLE_GMAIL_PUBSUB_TOPIC"),
    schedulerToken: (process.env.EMAIL_AUTOMATION_SCHEDULER_TOKEN?.trim().length ?? 0) >= 32,
    activationAccountConnection: activationMatches.length === 1,
    gmailInboundReadAccess: gmailInboundAccess.ok,
    gmailHistoryReadAccess: gmailHistoryReadAccess.ok,
  };
  const baseChecksReady = checks.gmailClientId && checks.gmailClientSecret && checks.gmailOauthStateSecret && checks.credentialEncryptionKey && checks.schedulerToken;
  const configReady = baseChecksReady && inboundModeValid && gmail.length > 0 && checks.activationAccountConnection && checks.gmailInboundReadAccess && checks.gmailHistoryReadAccess && (inboundMode !== "WATCH" || checks.pubSubTopic);
  const blockers = [
    ...(!checks.activationAccountConnection ? [`Expected exactly one connected Gmail connection for ${activationAccount}; found ${activationMatches.length}.`] : []),
    ...(!checks.gmailInboundReadAccess ? [`Gmail inbox read access is not authorized for ${activationAccount}. Use Enable Inbox Access and approve Google read-only Gmail access.`] : []),
    ...(checks.gmailInboundReadAccess && !checks.gmailHistoryReadAccess ? [`Gmail history.list read access failed for ${activationAccount}. Polling cannot be activated until Gmail history access succeeds.`] : []),
    ...(inboundMode === "WATCH" && !checks.pubSubTopic ? ["GOOGLE_GMAIL_PUBSUB_TOPIC is required in WATCH mode."] : []),
  ];
  const evidence = {
    status: configReady ? "READY" : "BLOCKED",
    deployedSha: current,
    activationAccount,
    activationWorkspaceId,
    inboundMode,
    inboundModeValid,
    inboundSyncEnabled: flag("EMAIL_INBOUND_SYNC_ENABLED"),
    runtimeMode: process.env.EMAIL_RUNTIME_MODE?.trim() || "DISABLED",
    externalWritesEnabled: flag("EMAIL_EXTERNAL_WRITES_ENABLED"),
    checks,
    gmailInboundAccess,
    gmailHistoryReadAccess,
    blockers,
    connectedEmailConnections: connections.length,
    connectedGmailConnections: gmail.length,
    cursorReadyGmailConnections: cursorReady.length,
    activationCursorReadyConnections: activationCursorReady.length,
    inboundMessages: inboundCount,
    unmatchedInboundMessages: unmatchedInboundCount,
    gmailAccounts: gmail.map((row) => ({ workspaceId: row.workspaceId, connectionId: row.id, authenticatedAccount: row.displayName, account: row.externalAccountId, cursorPresent: cursorReady.some((item) => item.id === row.id), syncMode: gmailInbound(row.capabilities).syncMode || null })),
  };
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (!configReady) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Email inbound readiness audit failed.");
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
