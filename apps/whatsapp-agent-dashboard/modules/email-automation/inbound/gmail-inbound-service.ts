import { buildEmailE1Runtime } from "../infrastructure/runtime";
import { ingestInboundEmail } from "../finalization/platform-service";
import { GmailEmailProviderAdapter } from "../providers/gmail/gmail-adapter";

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

async function gmailContext(workspaceId: string, connectionId: string) {
  const runtime = buildEmailE1Runtime(); const connection = await runtime.connections.getById({ workspaceId, connectionId });
  if (!connection || connection.provider !== "GOOGLE_GMAIL" || connection.status !== "CONNECTED") throw new Error("Connected Gmail account is required.");
  const adapter = runtime.providers.get("GOOGLE_GMAIL"); if (!(adapter instanceof GmailEmailProviderAdapter)) throw new Error("Gmail provider is unavailable.");
  return { connection, token: await adapter.getAccessTokenForConnection(workspaceId, connectionId) };
}
export async function startGmailMailboxWatch(input: { workspaceId: string; connectionId: string }) {
  if (process.env.EMAIL_INBOUND_SYNC_ENABLED !== "true") throw new Error("Email inbound sync is disabled.");
  const topicName = process.env.GOOGLE_GMAIL_PUBSUB_TOPIC?.trim(); if (!topicName) throw new Error("GOOGLE_GMAIL_PUBSUB_TOPIC is not configured.");
  const { token } = await gmailContext(input.workspaceId, input.connectionId);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ topicName, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" }), cache: "no-store" });
  if (!response.ok) throw new Error(`Gmail watch failed with HTTP ${response.status}.`); return response.json() as Promise<{ historyId?: string; expiration?: string }>;
}
export async function syncGmailHistory(input: { workspaceId: string; connectionId: string; startHistoryId: string }) {
  if (process.env.EMAIL_INBOUND_SYNC_ENABLED !== "true") throw new Error("Email inbound sync is disabled.");
  const { token } = await gmailContext(input.workspaceId, input.connectionId); const ids = new Set<string>(); let pageToken = "";
  do { const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history"); url.searchParams.set("startHistoryId", input.startHistoryId); url.searchParams.set("historyTypes", "messageAdded"); if (pageToken) url.searchParams.set("pageToken", pageToken); const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }); if (!response.ok) throw new Error(`Gmail history sync failed with HTTP ${response.status}.`); const body = await response.json() as any; for (const h of body.history ?? []) for (const item of h.messagesAdded ?? []) if (item.message?.id) ids.add(item.message.id); pageToken = body.nextPageToken || ""; } while (pageToken);
  let imported = 0; for (const id of ids) { const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }); if (!response.ok) continue; const message = await response.json() as any; const headers = message.payload?.headers as Array<{name?:string;value?:string}>|undefined; const bodies = bodyText(message.payload); const fromRaw = header(headers,"From"); const fromMatch = /<([^>]+)>/.exec(fromRaw); const from = (fromMatch?.[1] || fromRaw).trim(); if (!from.includes("@")) continue; await ingestInboundEmail({ workspaceId: input.workspaceId, connectionId: input.connectionId, provider: "GOOGLE_GMAIL", providerMessageId: message.id, providerThreadId: message.threadId, from, to: [header(headers,"To")], cc: header(headers,"Cc") ? [header(headers,"Cc")] : [], replyTo: header(headers,"Reply-To") || null, subject: header(headers,"Subject"), snippet: message.snippet || "", bodyText: bodies.text, bodyHtml: bodies.html, attachments: attachmentMetadata(message.payload), classification: "INBOUND", receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString() }); imported += 1; }
  return { discovered: ids.size, imported };
}
export async function fetchGmailInboundAttachment(input:{workspaceId:string;inboundMessageId:string;attachmentId:string}) {
  const row=await (await import("@/lib/db/prisma")).prisma.engageEmailInboundMessage.findFirst({where:{id:input.inboundMessageId,workspaceId:input.workspaceId,provider:"GOOGLE_GMAIL"}}); if(!row||!row.connectionId) throw new Error("Gmail inbound message was not found.");
  const attachments=Array.isArray(row.attachments)?row.attachments:[]; const meta=attachments.find((item:any)=>item&&typeof item==="object"&&item.attachmentId===input.attachmentId) as any; if(!meta) throw new Error("Inbound attachment was not found.");
  const {token}=await gmailContext(input.workspaceId,row.connectionId); const response=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(row.providerMessageId)}/attachments/${encodeURIComponent(input.attachmentId)}`,{headers:{authorization:`Bearer ${token}`},cache:"no-store"}); if(!response.ok) throw new Error(`Gmail attachment fetch failed with HTTP ${response.status}.`); const body=await response.json() as {data?:string}; if(!body.data) throw new Error("Gmail attachment payload is empty."); return {bytes:Buffer.from(body.data,"base64url"),fileName:String(meta.fileName||"attachment"),mimeType:String(meta.mimeType||"application/octet-stream")};
}
