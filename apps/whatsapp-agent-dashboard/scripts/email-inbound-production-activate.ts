import { execFileSync } from "node:child_process";

import { prisma } from "@/lib/db/prisma";
import { bootstrapGmailHistoryCursor, startGmailMailboxWatch, syncGmailHistory } from "@/modules/email-automation/inbound/gmail-inbound-service";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type Sender = { fromEmail?: unknown; verificationStatus?: unknown; isActive?: unknown; isWorkspaceDefault?: unknown };

async function main() {
  const expected = process.env.EXPECTED_RELEASE_SHA?.trim() || "";
  const allowedAccount = process.env.EMAIL_INBOUND_ACTIVATION_ACCOUNT?.trim().toLowerCase() || "";
  const inboundMode = (process.env.EMAIL_GMAIL_INBOUND_MODE?.trim().toUpperCase() || "POLLING");
  if (!/^[0-9a-f]{40}$/.test(expected)) throw new Error("EXPECTED_RELEASE_SHA is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(allowedAccount)) throw new Error("EMAIL_INBOUND_ACTIVATION_ACCOUNT is required.");
  if (inboundMode !== "POLLING" && inboundMode !== "WATCH") throw new Error("EMAIL_GMAIL_INBOUND_MODE must be POLLING or WATCH.");
  const current = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (current !== expected) throw new Error("Deployed git SHA does not match EXPECTED_RELEASE_SHA.");
  if (process.env.EMAIL_INBOUND_SYNC_ENABLED?.trim().toLowerCase() !== "true") throw new Error("EMAIL_INBOUND_SYNC_ENABLED must be true before Gmail activation.");
  if ((process.env.EMAIL_RUNTIME_MODE?.trim() || "") !== "DRY_RUN") throw new Error("Email send runtime must remain DRY_RUN during inbound activation.");
  if (process.env.EMAIL_EXTERNAL_WRITES_ENABLED?.trim().toLowerCase() === "true") throw new Error("Email external writes must remain disabled during inbound activation.");
  if (inboundMode === "WATCH" && !process.env.GOOGLE_GMAIL_PUBSUB_TOPIC?.trim()) throw new Error("GOOGLE_GMAIL_PUBSUB_TOPIC is required in WATCH mode.");

  const connections = await prisma.engageChannelConnection.findMany({
    where: { channel: "EMAIL", status: "CONNECTED" },
    select: { id: true, workspaceId: true, externalAccountId: true, capabilities: true },
  });
  const matches = connections.flatMap((connection) => {
    const capabilities = asRecord(connection.capabilities);
    if (capabilities.emailProvider !== "GOOGLE_GMAIL") return [];
    const metadata = asRecord(capabilities.emailAutomation);
    const senders = Array.isArray(metadata.senderIdentities) ? metadata.senderIdentities : [];
    const allowed = senders.some((raw) => {
      const sender = asRecord(raw) as Sender;
      return typeof sender.fromEmail === "string" && sender.fromEmail.trim().toLowerCase() === allowedAccount && sender.verificationStatus === "VERIFIED" && sender.isActive === true;
    });
    return allowed ? [connection] : [];
  });
  if (matches.length !== 1) throw new Error(`Expected exactly one connected Gmail connection for the activation account; found ${matches.length}.`);

  const connection = matches[0];
  const initialization = inboundMode === "WATCH"
    ? await startGmailMailboxWatch({ workspaceId: connection.workspaceId, connectionId: connection.id })
    : await bootstrapGmailHistoryCursor({ workspaceId: connection.workspaceId, connectionId: connection.id });
  const sync = await syncGmailHistory({ workspaceId: connection.workspaceId, connectionId: connection.id });
  process.stdout.write(`${JSON.stringify({ status: "PASS", account: allowedAccount, inboundMode, workspaceId: connection.workspaceId, connectionId: connection.id, initialization: { historyId: initialization.historyId, expiration: initialization.expiration, persisted: initialization.persisted, mode: initialization.mode, cursorInitializedAt: initialization.cursorInitializedAt }, sync: { discovered: sync.discovered, imported: sync.imported, replayed: sync.replayed, nextHistoryId: sync.nextHistoryId } }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Email inbound activation failed.");
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
