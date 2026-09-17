"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./email-inbox-workspace.module.css";

type Contact = { id:string; displayName:string|null; profileName:string|null; email:string|null; phone:string|null; city?:string|null; consentStatus?:string };
type Thread = { key:string; provider:string; connectionId:string|null; threadId:string; threadKind:"THREAD"|"MESSAGE"; latestInboundMessageId:string; contact:Contact|null; fromAddress:string; subject:string; preview:string; receivedAt:string; messageCount:number; attachmentCount:number };
type InboxResponse = { threads:Thread[]; guards:{ inboundSyncEnabled:boolean; gmailPubSubTopicConfigured:boolean } };
type Connection = { id:string; provider:string; displayName:string; externalAccountId:string; status:string };
type Sender = { id:string; fromEmail:string; fromName:string; verificationStatus:string; isActive:boolean; isWorkspaceDefault:boolean };
type Template = { id:string; name:string; status:string; category:string };
type InboundMessage = { id:string; fromAddress:string; subject:string; bodyText:string|null; bodyHtml:string|null; snippet:string|null; attachments:Array<{attachmentId?:string;fileName?:string;mimeType?:string;sizeBytes?:number}> };
type OutboundMessage = { id:string; status:string; subject:string; bodyText:string|null; bodyHtml:string|null; externalRequestSent:boolean; lastError:string|null };
type ThreadEvent = { kind:"INBOUND"|"OUTBOUND"; at:string; message:InboundMessage|OutboundMessage };
type ThreadDetail = { identity:{key:string;provider:string;connectionId:string|null;threadId:string;threadKind:"THREAD"|"MESSAGE"}; contact:Contact|null; events:ThreadEvent[] };

async function api<T>(url:string, init?:RequestInit):Promise<T>{
  const response=await fetch(url,{...init,headers:{...(init?.body?{"content-type":"application/json"}:{}),...init?.headers},cache:"no-store"});
  const payload=await response.json().catch(()=>({})) as Record<string,unknown>;
  if(!response.ok)throw new Error(typeof payload.error==="string"?payload.error:`Request failed (${response.status}).`);
  return payload as T;
}
function when(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short"}).format(d);}
function who(thread:Thread){return thread.contact?.displayName||thread.contact?.profileName||thread.fromAddress;}
function initials(value:string){return value.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("")||"E";}
function newKey(){return `inbox:${Date.now()}:${Math.random().toString(36).slice(2,9)}`;}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,(character)=>{switch(character){case "&":return "&amp;";case "<":return "&lt;";case ">":return "&gt;";case '"':return "&quot;";case "'":return "&#39;";default:return character;}});}

export default function EmailInboxWorkspace(){
  const [threads,setThreads]=useState<Thread[]>([]),[selected,setSelected]=useState<string>(""),[detail,setDetail]=useState<ThreadDetail|null>(null);
  const [guards,setGuards]=useState<InboxResponse["guards"]>({inboundSyncEnabled:false,gmailPubSubTopicConfigured:false});
  const [connections,setConnections]=useState<Connection[]>([]),[senders,setSenders]=useState<Sender[]>([]),[templates,setTemplates]=useState<Template[]>([]);
  const [search,setSearch]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [replyText,setReplyText]=useState(""),[replyTemplateId,setReplyTemplateId]=useState(""),[replySenderId,setReplySenderId]=useState(""),[replyAll,setReplyAll]=useState(false);

  const load=useCallback(async()=>{
    const [inbox,accountState,templateState]=await Promise.all([
      api<InboxResponse>("/api/email/inbound?limit=80"),
      api<{connections:Connection[];senders:Sender[]}>("/api/email/connections"),
      api<{templates:Template[]}>("/api/email/templates"),
    ]);
    setThreads(inbox.threads);setGuards(inbox.guards);
    setConnections(accountState.connections);setSenders(accountState.senders.filter(x=>x.isActive&&x.verificationStatus==="VERIFIED"));
    setTemplates(templateState.templates.filter(x=>x.status==="APPROVED"));
    setSelected(current=>current&&inbox.threads.some(t=>t.key===current)?current:(inbox.threads[0]?.key??""));
  },[]);

  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"Inbox could not load."));},[load]);
  const selectedThread=threads.find(t=>t.key===selected)??null;
  useEffect(()=>{
    if(!selectedThread){setDetail(null);return;}
    const query=new URLSearchParams({provider:selectedThread.provider,threadId:selectedThread.threadId,threadKind:selectedThread.threadKind});
    if(selectedThread.connectionId)query.set("connectionId",selectedThread.connectionId);
    setDetail(null);setError("");
    void api<ThreadDetail>(`/api/email/inbound/thread?${query.toString()}`).then(setDetail).catch(e=>setError(e instanceof Error?e.message:"Thread could not load."));
  },[selected,selectedThread?.key]);

  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();if(!q)return threads;return threads.filter(t=>[who(t),t.fromAddress,t.subject,t.preview].some(v=>v.toLowerCase().includes(q)));},[threads,search]);
  const gmailConnections=connections.filter(c=>c.provider==="GOOGLE_GMAIL"&&c.status==="CONNECTED");
  const latestInbound=[...(detail?.events??[])].reverse().find(e=>e.kind==="INBOUND")?.message as InboundMessage|undefined;
  const canReply=Boolean(latestInbound&&replyTemplateId&&replyText.trim()&&!busy);

  async function refresh(){setBusy(true);setError("");try{await load();setNotice("Inbox refreshed.");}catch(e){setError(e instanceof Error?e.message:"Refresh failed.");}finally{setBusy(false);}}
  async function startWatch(connectionId:string){setBusy(true);setError("");setNotice("");try{const result=await api<{historyId:string;expiration:string|null;persisted:boolean}>("/api/email/inbound/gmail/watch",{method:"POST",body:JSON.stringify({connectionId})});setNotice(`Gmail watch active. Cursor ${result.historyId} persisted.`);await load();}catch(e){setError(e instanceof Error?e.message:"Gmail watch failed.");}finally{setBusy(false);}}
  async function syncNow(connectionId:string){setBusy(true);setError("");setNotice("");try{const result=await api<{discovered:number;imported:number;replayed:number}>("/api/email/inbound/gmail/sync",{method:"POST",body:JSON.stringify({connectionId})});setNotice(`Sync complete: ${result.imported} imported, ${result.replayed} replayed, ${result.discovered} discovered.`);await load();}catch(e){setError(e instanceof Error?e.message:"Gmail sync failed.");}finally{setBusy(false);}}
  async function sendReply(){if(!latestInbound||!selectedThread||!canReply)return;setBusy(true);setError("");setNotice("");try{const subject=latestInbound.subject?.trim()||selectedThread.subject;const text=replyText.trim();const result=await api<{message:{status:string;externalRequestSent:boolean};replayed:boolean}>("/api/email/inbound/reply",{method:"POST",body:JSON.stringify({inboundMessageId:latestInbound.id,templateId:replyTemplateId,senderIdentityId:replySenderId||null,replyAll,idempotencyKey:newKey(),subjectOverride:/^re:/i.test(subject)?subject:`Re: ${subject}`,textOverride:text,htmlOverride:`<p>${escapeHtml(text).replace(/\n/g,"<br />")}</p>`})});setNotice(result.message.externalRequestSent?`Reply sent. Status: ${result.message.status}.`:`Reply recorded in ${result.message.status} mode; no external request was sent.`);setReplyText("");const query=new URLSearchParams({provider:selectedThread.provider,threadId:selectedThread.threadId,threadKind:selectedThread.threadKind});if(selectedThread.connectionId)query.set("connectionId",selectedThread.connectionId);setDetail(await api<ThreadDetail>(`/api/email/inbound/thread?${query.toString()}`));}catch(e){setError(e instanceof Error?e.message:"Reply failed.");}finally{setBusy(false);}}

  return <section className={styles.root} aria-label="Unified Email Inbox">
    <div className={styles.topRail}>
      <div><span className={styles.kicker}>EMAIL · E5</span><h2>Unified Inbox</h2><p>Workspace-isolated Gmail threads, CRM context, attachments and guarded replies.</p></div>
      <div className={styles.actions}><span className={guards.inboundSyncEnabled?styles.goodPill:styles.warnPill}>Inbound {guards.inboundSyncEnabled?"ON":"OFF"}</span><span className={guards.gmailPubSubTopicConfigured?styles.goodPill:styles.warnPill}>Pub/Sub {guards.gmailPubSubTopicConfigured?"READY":"NEEDS CONFIG"}</span><button onClick={()=>void refresh()} disabled={busy}>↻ Refresh</button></div>
    </div>
    {error?<div className={styles.error}>{error}</div>:null}{notice?<div className={styles.notice}>{notice}</div>:null}

    <div className={styles.syncStrip}>
      <div><strong>Gmail inbound control</strong><small>{gmailConnections.length} connected Gmail account{gmailConnections.length===1?"":"s"}</small></div>
      <div className={styles.syncAccounts}>{gmailConnections.length?gmailConnections.map(c=><div key={c.id} className={styles.syncAccount}><span><b>{c.displayName}</b><small>{c.externalAccountId}</small></span><button disabled={busy||!guards.inboundSyncEnabled||!guards.gmailPubSubTopicConfigured} onClick={()=>void startWatch(c.id)}>Start watch</button><button disabled={busy||!guards.inboundSyncEnabled} onClick={()=>void syncNow(c.id)}>Sync now</button></div>):<span className={styles.muted}>No connected Gmail account.</span>}</div>
    </div>

    <div className={styles.workspace}>
      <aside className={styles.threadPane}>
        <div className={styles.search}><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search sender, subject or message" /></div>
        <div className={styles.threadCount}><strong>{filtered.length}</strong><span>threads</span></div>
        <div className={styles.threadList}>{filtered.map(thread=><button key={thread.key} className={`${styles.threadCard} ${selected===thread.key?styles.active:""}`} onClick={()=>setSelected(thread.key)}><span className={styles.avatar}>{initials(who(thread))}</span><span className={styles.threadCopy}><span className={styles.threadHeader}><strong>{who(thread)}</strong><time>{when(thread.receivedAt)}</time></span><b className={styles.subject}>{thread.subject||"(no subject)"}</b><span className={styles.preview}>{thread.preview||"No preview available"}</span><span className={styles.meta}>{thread.messageCount} msg{thread.messageCount===1?"":"s"}{thread.attachmentCount?` · ${thread.attachmentCount} attachment${thread.attachmentCount===1?"":"s"}`:""}</span></span></button>)}</div>
      </aside>

      <main className={styles.messagePane}>
        {selectedThread?<><header className={styles.messageHeader}><div><small>{selectedThread.provider}</small><h3>{selectedThread.subject||"(no subject)"}</h3><p>{who(selectedThread)} · {selectedThread.fromAddress}</p></div><span className={styles.threadBadge}>{selectedThread.messageCount} messages</span></header>
        <div className={styles.timeline}>{detail?detail.events.map(event=><article key={`${event.kind}:${event.message.id}:${event.at}`} className={event.kind==="INBOUND"?styles.inbound:styles.outbound}><div className={styles.eventHeader}><strong>{event.kind==="INBOUND"?"Inbound":"Outbound"}</strong><time>{when(event.at)}</time></div><div className={styles.eventSubject}>{event.message.subject||"(no subject)"}</div><p>{event.message.bodyText?.trim()||("snippet" in event.message?event.message.snippet:"")||"HTML email — open source message for full rendering."}</p>{event.kind==="INBOUND"&&"attachments" in event.message&&event.message.attachments.length?<div className={styles.attachments}>{event.message.attachments.map((file,index)=>file.attachmentId?<a key={`${file.attachmentId}:${index}`} href={`/api/email/inbound/${event.message.id}/attachments/${encodeURIComponent(file.attachmentId)}`} target="_blank" rel="noreferrer">▧ {file.fileName||"Attachment"}</a>:null)}</div>:null}{event.kind==="OUTBOUND"&&"status" in event.message?<div className={styles.statusLine}><span>{event.message.status}</span>{event.message.lastError?<em>{event.message.lastError}</em>:null}</div>:null}</article>):<div className={styles.loading}>Loading thread…</div>}</div>
        <div className={styles.replyBox}><div className={styles.replyTop}><strong>Reply</strong><label><input type="checkbox" checked={replyAll} onChange={e=>setReplyAll(e.target.checked)} /> Reply all</label></div><div className={styles.replyControls}><select value={replyTemplateId} onChange={e=>setReplyTemplateId(e.target.value)}><option value="">Approved template…</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><select value={replySenderId} onChange={e=>setReplySenderId(e.target.value)}><option value="">Default sender</option>{senders.map(s=><option key={s.id} value={s.id}>{s.fromName} · {s.fromEmail}</option>)}</select></div><textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="Write a reply. Runtime policy still decides whether this is dry-run, internal-only or externally sent." rows={5}/><button className={styles.primary} disabled={!canReply} onClick={()=>void sendReply()}>{busy?"Working…":"Send guarded reply"}</button></div></>:<div className={styles.empty}><span>✉</span><h3>No inbound email yet</h3><p>Start Gmail watch when inbound runtime is ready, then new threads will appear here.</p></div>}
      </main>

      <aside className={styles.contextPane}><span className={styles.kicker}>CRM CONTEXT</span>{detail?.contact?<><div className={styles.contactAvatar}>{initials(detail.contact.displayName||detail.contact.profileName||detail.contact.email||"Contact")}</div><h3>{detail.contact.displayName||detail.contact.profileName||"Known contact"}</h3><p>{detail.contact.email||selectedThread?.fromAddress}</p><dl><div><dt>Phone</dt><dd>{detail.contact.phone||"—"}</dd></div><div><dt>City</dt><dd>{detail.contact.city||"—"}</dd></div><div><dt>Consent</dt><dd>{detail.contact.consentStatus||"—"}</dd></div></dl></>:<div className={styles.noContact}><span>◎</span><strong>Unmatched sender</strong><p>This inbound address is not yet safely mapped to a CRM contact in this thread.</p></div>}<div className={styles.safetyCard}><strong>Isolation guard</strong><p>Thread and attachment reads are always constrained to the active EngageOS workspace.</p></div></aside>
    </div>
  </section>;
}
