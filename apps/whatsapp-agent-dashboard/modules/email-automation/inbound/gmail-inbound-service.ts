import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildEmailE1Runtime } from "../infrastructure/runtime";
import { GmailEmailProviderAdapter } from "../providers/gmail/gmail-adapter";
import { ingestWorkspaceSafeInboundEmail as ingestInboundEmail } from "./workspace-safe-ingest";
import { detectGmailBounce } from "./gmail-bounce-detection";

function header(headers: Array<{ name?: string; value?: string }> | undefined, name: string): string {
  return headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value?.trim() || "";
}
function decode(data?: string): string { if (!data) return ""; try { return Buffer.from(data, "base64url").toString("utf8"); } catch { return ""; } }
function bodyText(payload: any): { text: string; html: string } {
  if (!payload) return { text: "", html: "" };
  if (payload.mimeType === "text/plain") return { text: decode(payload.body?.data), html: "" };
  if (payload.mimeType === "text/html") return { text: "", html: decode(payload.body?.data) };
  return (payload.parts ?? []).reduce((acc: { text: string; html: string }, part: any) => { const next = bodyText(part); return { text: acc.text || next.text, html: acc.html || next.html }; }, { text: "", html: "" });
}
function attachmentMetadata(payload: any): Array<{ attachmentId:string; fileName:string; mimeType:string; sizeBytes:number }> {
  const out: Array<{ attachmentId:string; fileName:string; mimeType:string; sizeBytes:number }> = [];
  const walk=(part:any)=>{ if(!part)return; const attachmentId=typeof part.body?.attachmentId==="string"?part.body.attachmentId:""; const fileName=typeof part.filename==="string"?part.filename:""; const mimeType=typeof part.mimeType==="string"?part.mimeType:"application/octet-stream"; const sizeBytes=Number(part.body?.size)||0; if(attachmentId && (fileName || !mimeType.startsWith("text/"))) out.push({attachmentId,fileName:fileName||"attachment",mimeType,sizeBytes}); for(const child of part.parts??[]) walk(child); };
  walk(payload); return out;
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function watchStateFromCapabilities(value: unknown) {
  const state = asRecord(asRecord(value).gmailInbound);
  return {
    historyId: typeof state.historyId === "string" ? state.historyId.trim() : "",
    expiration: typeof state.expiration === "string" ? state.expiration.trim() : "",
    watchStartedAt: typeof state.watchStartedAt === "string" ? state.watchStartedAt.trim() : "",
    lastSyncedAt: typeof state.lastSyncedAt === "string" ? state.lastSyncedAt.trim() : "",
    syncMode: state.syncMode === "WATCH" ? "WATCH" : state.syncMode === "POLLING" ? "POLLING" : "",
    cursorInitializedAt: typeof state.cursorInitializedAt === "string" ? state.cursorInitializedAt.trim() : "",
  };
}
async function persistGmailInboundState(input:{workspaceId:string;connectionId:string;historyId:string;expiration?:string|null;watchStartedAt?:string|null;lastSyncedAt?:string|null;syncMode?:"POLLING"|"WATCH"|null;cursorInitializedAt?:string|null}) {
  const row = await prisma.engageChannelConnection.findFirst({
    where: { id: input.connectionId, workspaceId: input.workspaceId, channel: "EMAIL" },
    select: { id: true, capabilities: true },
  });
  if (!row) throw new Error("Email connection was not found while persisting Gmail inbound state.");
  const existing = asRecord(row.capabilities);
  const current = watchStateFromCapabilities(row.capabilities);
  const gmailInbound = {
    historyId: input.historyId,
    expiration: (input.expiration ?? current.expiration) || null,
    watchStartedAt: (input.watchStartedAt ?? current.watchStartedAt) || null,
    lastSyncedAt: (input.lastSyncedAt ?? current.lastSyncedAt) || null,
    syncMode: (input.syncMode ?? current.syncMode) || null,
    cursorInitializedAt: (input.cursorInitializedAt ?? current.cursorInitializedAt) || null,
  };
  await prisma.engageChannelConnection.update({
    where: { id: row.id },
    data: { capabilities: JSON.parse(JSON.stringify({ ...existing, gmailInbound })) },
  });
}
async function gmailInboundState(workspaceId:string, connectionId:string) {
  const row = await prisma.engageChannelConnection.findFirst({
    where: { id: connectionId, workspaceId, channel: "EMAIL" },
    select: { capabilities: true },
  });
  return row ? watchStateFromCapabilities(row.capabilities) : { historyId:"", expiration:"", watchStartedAt:"", lastSyncedAt:"", syncMode:"", cursorInitializedAt:"" };
}

async function gmailContext(workspaceId: string, connectionId: string) {
  const runtime = buildEmailE1Runtime(); const connection = await runtime.connections.getById({ workspaceId, connectionId });
  if (!connection || connection.provider !== "GOOGLE_GMAIL" || connection.status !== "CONNECTED") throw new Error("Connected Gmail account is required.");
  const adapter = runtime.providers.get("GOOGLE_GMAIL"); if (!(adapter instanceof GmailEmailProviderAdapter)) throw new Error("Gmail provider is unavailable.");
  return { connection, token: await adapter.getAccessTokenForConnection(workspaceId, connectionId) };
}
export async function bootstrapGmailHistoryCursor(input: { workspaceId: string; connectionId: string }) {
  if (process.env.EMAIL_INBOUND_SYNC_ENABLED !== "true") throw new Error("Email inbound sync is disabled.");
  const { token } = await gmailContext(input.workspaceId, input.connectionId);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`Gmail profile bootstrap failed with HTTP ${response.status}.`);
  const body = await response.json() as { historyId?: string };
  const historyId = body.historyId?.trim();
  if (!historyId) throw new Error("Gmail profile did not include a historyId.");
  const initializedAt = new Date().toISOString();
  await persistGmailInboundState({ workspaceId: input.workspaceId, connectionId: input.connectionId, historyId, expiration: null, watchStartedAt: null, lastSyncedAt: null, syncMode: "POLLING", cursorInitializedAt: initializedAt });
  return { historyId, expiration: null, persisted: true, mode: "POLLING" as const, cursorInitializedAt: initializedAt };
}
export async function startGmailMailboxWatch(input: { workspaceId: string; connectionId: string }) {
  if (process.env.EMAIL_INBOUND_SYNC_ENABLED !== "true") throw new Error("Email inbound sync is disabled.");
  const topicName = process.env.GOOGLE_GMAIL_PUBSUB_TOPIC?.trim(); if (!topicName) throw new Error("GOOGLE_GMAIL_PUBSUB_TOPIC is not configured.");
  const { token } = await gmailContext(input.workspaceId, input.connectionId);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ topicName, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" }), cache: "no-store" });
  if (!response.ok) throw new Error(`Gmail watch failed with HTTP ${response.status}.`);
  const body = await response.json() as { historyId?: string; expiration?: string };
  const historyId = body.historyId?.trim();
  if (!historyId) throw new Error("Gmail watch response did not include a historyId.");
  const initializedAt = new Date().toISOString();
  await persistGmailInboundState({ workspaceId: input.workspaceId, connectionId: input.connectionId, historyId, expiration: body.expiration ?? null, watchStartedAt: initializedAt, lastSyncedAt: null, syncMode: "WATCH", cursorInitializedAt: initializedAt });
  return { historyId, expiration: body.expiration ?? null, persisted: true, mode: "WATCH" as const, cursorInitializedAt: initializedAt };
}
export async function syncGmailHistory(input: { workspaceId: string; connectionId: string; startHistoryId?: string | null }) {
  if (process.env.EMAIL_INBOUND_SYNC_ENABLED !== "true") throw new Error("Email inbound sync is disabled.");
  const state = await gmailInboundState(input.workspaceId, input.connectionId);
  const startHistoryId = input.startHistoryId?.trim() || state.historyId;
  if (!startHistoryId) throw new Error("Gmail inbound cursor is not initialized for this connection.");
  const { token } = await gmailContext(input.workspaceId, input.connectionId); const ids = new Set<string>(); let pageToken = ""; let latestHistoryId = startHistoryId;
  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
    url.searchParams.set("startHistoryId", startHistoryId);
    url.searchParams.set("historyTypes", "messageAdded");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`Gmail history sync failed with HTTP ${response.status}.`);
    const body = await response.json() as any;
    for (const h of body.history ?? []) for (const item of h.messagesAdded ?? []) if (item.message?.id) ids.add(item.message.id);
    if (typeof body.historyId === "string" && body.historyId.trim()) latestHistoryId = body.historyId.trim();
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  let imported = 0, replayed = 0;
  for (const id of ids) {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) continue;
    const message = await response.json() as any;
    const headers = message.payload?.headers as Array<{name?:string;value?:string}>|undefined;
    const bodies = bodyText(message.payload);
    const fromRaw = header(headers,"From");
    const fromMatch = /<([^>]+)>/.exec(fromRaw);
    const from = (fromMatch?.[1] || fromRaw).trim();
    if (!from.includes("@")) continue;
    const subject = header(headers,"Subject");
    const bounce = detectGmailBounce({
      headers,
      payload: message.payload,
      from: fromRaw,
      subject,
      snippet: message.snippet || "",
      bodyText: bodies.text,
      bodyHtml: bodies.html,
    });
    try {
      const result = await ingestInboundEmail({ workspaceId: input.workspaceId, connectionId: input.connectionId, provider: "GOOGLE_GMAIL", providerMessageId: message.id, providerThreadId: message.threadId, from, to: [header(headers,"To")], cc: header(headers,"Cc") ? [header(headers,"Cc")] : [], replyTo: header(headers,"Reply-To") || null, subject, snippet: message.snippet || "", bodyText: bodies.text, bodyHtml: bodies.html, attachments: attachmentMetadata(message.payload), classification: bounce.classification, bounceRecipient: bounce.failedRecipient, bounceClass: bounce.bounceClass, bounceStatusCode: bounce.statusCode, receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString() });
      if (result.replayed) replayed += 1; else imported += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") replayed += 1;
      else throw error;
    }
  }
  await persistGmailInboundState({ workspaceId: input.workspaceId, connectionId: input.connectionId, historyId: latestHistoryId, lastSyncedAt: new Date().toISOString() });
  return { discovered: ids.size, imported, replayed, startHistoryId, nextHistoryId: latestHistoryId };
}
export async function syncWatchedGmailMailboxes(input: { workspaceId?: string; limit?: number } = {}) {
  if (process.env.EMAIL_INBOUND_SYNC_ENABLED !== "true") return { enabled: false, scanned: 0, synced: 0, failed: 0, results: [] as Array<Record<string, unknown>> };
  const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 20)));
  const connections = await prisma.engageChannelConnection.findMany({
    where: { channel: "EMAIL", status: "CONNECTED", ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}) },
    orderBy: { updatedAt: "asc" },
    take: limit * 3,
    select: { id: true, workspaceId: true, capabilities: true },
  });
  const watched = connections.filter((row) => asRecord(row.capabilities).emailProvider === "GOOGLE_GMAIL" && Boolean(watchStateFromCapabilities(row.capabilities).historyId)).slice(0, limit);
  const results: Array<Record<string, unknown>> = [];
  let synced = 0, failed = 0;
  for (const connection of watched) {
    try {
      const result = await syncGmailHistory({ workspaceId: connection.workspaceId, connectionId: connection.id });
      synced += 1;
      results.push({ connectionId: connection.id, workspaceId: connection.workspaceId, ok: true, discovered: result.discovered, imported: result.imported, replayed: result.replayed });
    } catch (error) {
      failed += 1;
      results.push({ connectionId: connection.id, workspaceId: connection.workspaceId, ok: false, error: error instanceof Error ? error.message : "Gmail inbound sync failed." });
    }
  }
  return { enabled: true, scanned: watched.length, synced, failed, results };
}
export async function fetchGmailInboundAttachment(input:{workspaceId:string;inboundMessageId:string;attachmentId:string}) {
  const row=await prisma.engageEmailInboundMessage.findFirst({where:{id:input.inboundMessageId,workspaceId:input.workspaceId,provider:"GOOGLE_GMAIL"}}); if(!row||!row.connectionId) throw new Error("Gmail inbound message was not found.");
  const attachments=Array.isArray(row.attachments)?row.attachments:[]; const meta=attachments.find((item:any)=>item&&typeof item==="object"&&item.attachmentId===input.attachmentId) as any; if(!meta) throw new Error("Inbound attachment was not found.");
  const {token}=await gmailContext(input.workspaceId,row.connectionId); const response=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(row.providerMessageId)}/attachments/${encodeURIComponent(input.attachmentId)}`,{headers:{authorization:`Bearer ${token}`},cache:"no-store"}); if(!response.ok) throw new Error(`Gmail attachment fetch failed with HTTP ${response.status}.`); const body=await response.json() as {data?:string}; if(!body.data) throw new Error("Gmail attachment payload is empty."); return {bytes:Buffer.from(body.data,"base64url"),fileName:String(meta.fileName||"attachment"),mimeType:String(meta.mimeType||"application/octet-stream")};
}
