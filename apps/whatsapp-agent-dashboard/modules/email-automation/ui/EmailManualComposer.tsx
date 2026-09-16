"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./email-manual-composer.module.css";

type Summary = { id:string; name:string; category:string; status:string; currentVersion:number };
type Variable = { key:string; label:string; required:boolean; fallback?:string };
type Block = { id:string; type:string; text?:string; label?:string; url?:string };
type Version = { id:string; version:number; document:{ subject:string; preheader:string|null; variables:Variable[]; blocks?:Block[] }; defaultSenderIdentityId:string|null };
type Detail = Summary & { versions:Version[] };
type Sender = { id:string; fromName:string; fromEmail:string; verificationStatus:string; isActive:boolean; isWorkspaceDefault:boolean };
type Runtime = { runtimeEnabled:boolean; externalWritesEnabled:boolean; mode:string; internalRecipientAllowlistCount:number; manualSendEnabled:boolean };
type Audit = { id:string; status:string; runtimeMode:string; subject:string; toRecipients:unknown; externalRequestSent:boolean; providerMessageId:string|null; lastError:string|null; retryOfMessageId?:string|null; createdAt:string };

async function api<T>(url:string,init?:RequestInit):Promise<T>{
  const r=await fetch(url,{...init,headers:{...(init?.body?{"content-type":"application/json"}:{}),...init?.headers},cache:"no-store"});
  const p=await r.json().catch(()=>({})) as Record<string,unknown>;
  if(!r.ok)throw new Error(typeof p.error==="string"?p.error:`Request failed (${r.status}).`);
  return p as T;
}
function addresses(value:string){return value.split(/[;,]/).map(v=>v.trim()).filter(Boolean).map(email=>({email}));}
function newKey(){return `manual:${Date.now()}:${Math.random().toString(36).slice(2,10)}`;}
function toLabel(value:unknown){if(!Array.isArray(value))return "";return value.map(v=>v&&typeof v==="object"&&"email" in v?String((v as {email:unknown}).email):"").filter(Boolean).join(", ");}

export default function EmailManualComposer(){
  const [templates,setTemplates]=useState<Summary[]>([]);
  const [senders,setSenders]=useState<Sender[]>([]);
  const [runtime,setRuntime]=useState<Runtime|null>(null);
  const [audits,setAudits]=useState<Audit[]>([]);
  const [templateId,setTemplateId]=useState("");
  const [detail,setDetail]=useState<Detail|null>(null);
  const [senderId,setSenderId]=useState("");
  const [to,setTo]=useState(""),[cc,setCc]=useState(""),[bcc,setBcc]=useState(""),[replyTo,setReplyTo]=useState("");
  const [values,setValues]=useState<Record<string,string>>({});
  const [idempotencyKey,setIdempotencyKey]=useState(newKey());
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState<{kind:"ok"|"error";text:string}|null>(null);
  const [subjectOverride,setSubjectOverride]=useState("");

  const load=useCallback(async()=>{
    const [t,c,r,m]=await Promise.all([
      api<{templates:Summary[]}>("/api/email/templates"),
      api<{senders:Sender[]}>("/api/email/connections"),
      api<Runtime>("/api/email/runtime"),
      api<{messages:Audit[]}>("/api/email/messages?limit=12")
    ]);
    setTemplates(t.templates.filter(x=>x.status==="APPROVED"));
    setSenders(c.senders.filter(s=>s.verificationStatus==="VERIFIED"&&s.isActive));
    setRuntime(r);setAudits(m.messages);
  },[]);
  useEffect(()=>{void load().catch(e=>setNotice({kind:"error",text:e instanceof Error?e.message:"Manual email state could not load."}));},[load]);
  useEffect(()=>{
    if(!templateId){setDetail(null);setValues({});setSubjectOverride("");return;}
    void api<{template:Detail}>(`/api/email/templates/${templateId}`).then(r=>{
      setDetail(r.template);
      const v=r.template.versions.find(x=>x.version===r.template.currentVersion);
      if(v){
        setSenderId(v.defaultSenderIdentityId??"");
        const next:Record<string,string>={};
        for(const variable of v.document.variables)next[variable.key]=variable.fallback??"";
        setValues(next);
      }
    }).catch(e=>setNotice({kind:"error",text:e instanceof Error?e.message:"Template could not load."}));
  },[templateId]);

  const version=useMemo(()=>detail?.versions.find(v=>v.version===detail.currentVersion)??null,[detail]);
  const selectedSender=senders.find(s=>s.id===senderId)??senders.find(s=>s.isWorkspaceDefault)??null;
  const canSend=Boolean(runtime?.manualSendEnabled&&version&&to.trim()&&!busy);
  const internalOnly=runtime?.mode==="INTERNAL_RECIPIENTS";
  const previewSubject=subjectOverride.trim()||version?.document.subject||"Select an approved template";
  const recent24=audits.filter(a=>Date.now()-new Date(a.createdAt).getTime()<86400000).length;

  async function retryMessage(messageId:string){
    setBusy(true);setNotice(null);
    try{
      const result=await api<{message:{status:string;externalRequestSent:boolean};replayed:boolean}>(`/api/email/messages/${messageId}/retry`,{method:"POST",body:JSON.stringify({idempotencyKey:newKey()})});
      setNotice({kind:"ok",text:result.message.externalRequestSent?`Retry sent. Status: ${result.message.status}.`:"Retry dry-run recorded. No external request was sent."});
      await load();
    }catch(e){setNotice({kind:"error",text:e instanceof Error?e.message:"Email retry failed."});}
    finally{setBusy(false);}
  }

  async function submit(){
    if(!version||!detail)return;
    setBusy(true);setNotice(null);
    try{
      const result=await api<{message:{status:string;externalRequestSent:boolean};replayed:boolean}>("/api/email/messages/manual",{
        method:"POST",
        body:JSON.stringify({
          templateId:detail.id,senderIdentityId:senderId||null,to:addresses(to),cc:addresses(cc),bcc:addresses(bcc),
          ...(replyTo.trim()?{replyTo:{email:replyTo.trim()}}:{}),variables:values,idempotencyKey,
          ...(subjectOverride.trim()?{subjectOverride}:{})
        })
      });
      setNotice({kind:"ok",text:result.replayed?`Idempotent replay: existing ${result.message.status} record returned.`:result.message.externalRequestSent?`Email sent. Status: ${result.message.status}.`:"Dry run recorded. No external request was sent."});
      setIdempotencyKey(newKey());await load();
    }catch(e){setNotice({kind:"error",text:e instanceof Error?e.message:"Manual email failed."});}
    finally{setBusy(false);}
  }

  return <section className={styles.root} aria-label="Manual transactional email composer">
    <div className={styles.statusRail}>
      <span className={styles.modePill}>⚗ {runtime?.mode??"LOADING"}</span>
      <span className={styles.safePill}>👥 {internalOnly?`${runtime?.internalRecipientAllowlistCount??0} internal recipients`:"Guarded recipients"}</span>
      <span className={styles.auditPill}>🛡 Audit protected</span>
    </div>

    <div className={styles.summaryGrid}>
      <article><span className={styles.summaryIcon}>⚙</span><div><small>Mode</small><strong>{runtime?.mode??"Loading"}</strong><p>{runtime?.externalWritesEnabled?"External writes enabled":"External writes protected"}</p></div></article>
      <article><span className={styles.summaryIconGreen}>◎</span><div><small>Default sender</small><strong className={styles.emailValue}>{senders.find(s=>s.isWorkspaceDefault)?.fromEmail??"Not selected"}</strong><p>Workspace default</p></div></article>
      <article><span className={styles.summaryIconGreen}>▤</span><div><small>Approved templates</small><strong>{templates.length}</strong><p>Ready to use</p></div></article>
      <article><span className={styles.summaryIconPurple}>➤</span><div><small>Recent sends (24h)</small><strong>{recent24}</strong><p>From real audit records</p></div></article>
    </div>

    {notice?<div className={notice.kind==="ok"?styles.ok:styles.error}>{notice.text}</div>:null}

    <div className={styles.workspace}>
      <main className={styles.steps}>
        <section className={styles.stepCard}>
          <div className={styles.stepHead}><b>1</b><div><h3>Sender & Template</h3><p>Choose a verified sender and an approved template.</p></div></div>
          <div className={styles.twoCol}>
            <label>From (Sender)<select value={senderId} onChange={e=>setSenderId(e.target.value)}><option value="">Template / workspace default</option>{senders.map(s=><option key={s.id} value={s.id}>{s.fromName} · {s.fromEmail}{s.isWorkspaceDefault?" · Default":""}</option>)}</select></label>
            <label>Template<select value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Select template</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name} · v{t.currentVersion}</option>)}</select></label>
          </div>
        </section>

        <section className={styles.stepCard}>
          <div className={styles.stepHead}><b>2</b><div><h3>Recipients</h3><p>Specify who should receive this email.</p></div></div>
          <label>To<input value={to} onChange={e=>setTo(e.target.value)} placeholder="recipient@example.com"/></label>
          <div className={styles.twoCol}><label>CC<input value={cc} onChange={e=>setCc(e.target.value)} placeholder="optional"/></label><label>BCC<input value={bcc} onChange={e=>setBcc(e.target.value)} placeholder="optional"/></label></div>
          <label>Reply-To<input value={replyTo} onChange={e=>setReplyTo(e.target.value)} placeholder="optional@example.com"/></label>
        </section>

        <section className={styles.stepCard}>
          <div className={styles.stepHead}><b>3</b><div><h3>Personalization</h3><p>Populate approved template variables.</p></div></div>
          {version?.document.variables.length?version.document.variables.map(v=><label key={v.key}>{v.label}{v.required?<em>Required</em>:null}<input value={values[v.key]??""} onChange={e=>setValues(x=>({...x,[v.key]:e.target.value}))} placeholder={v.fallback??`{{${v.key}}}`}/><code>{`{{${v.key}}}`}</code></label>):<p className={styles.emptyText}>Select a template to load personalization variables.</p>}
          {version?<label>Subject override<input value={subjectOverride} onChange={e=>setSubjectOverride(e.target.value)} placeholder="Blank = approved template subject"/></label>:null}
        </section>

        <section className={styles.stepCard}>
          <div className={styles.stepHead}><b>4</b><div><h3>Schedule & Send</h3><p>Send now through the guarded runtime.</p></div></div>
          <div className={styles.safetyRow}><span>● Runtime: {runtime?.mode??"Loading"}</span><span>● Idempotency protected</span><span>● Audit logging enabled</span></div>
          <div className={styles.actions}><code>{idempotencyKey}</code><button disabled={!canSend} onClick={()=>void submit()}>{busy?"Processing…":runtime?.mode==="DRY_RUN"?"Send Email (DRY_RUN)":runtime?.mode==="INTERNAL_RECIPIENTS"?"Send Internal Email":"Runtime locked"}</button></div>
        </section>
      </main>

      <aside className={styles.sideColumn}>
        <section className={styles.previewCard}>
          <div className={styles.cardHead}><div><span>MESSAGE PREVIEW</span><h3>Desktop</h3></div><span className={styles.desktopPill}>Desktop</span></div>
          <div className={styles.mailPreview}>
            <div className={styles.brand}>Sikha<span>Denge</span></div>
            <h2>{previewSubject}</h2>
            <p>{version?.document.preheader??"Choose an approved template to preview its message."}</p>
            {version?.document.blocks?.slice(0,4).map(block=>block.type==="HEADING"?<h3 key={block.id}>{block.text}</h3>:block.type==="TEXT"?<p key={block.id}>{block.text}</p>:block.type==="BUTTON"?<span className={styles.previewButton} key={block.id}>{block.label}</span>:null)}
            <small>From {selectedSender?.fromEmail??"workspace default"}</small>
          </div>
        </section>

        <div className={styles.sideGrid}>
          <section className={styles.checkCard}>
            <div className={styles.cardHead}><h3>Approval Checklist</h3><span className={styles.readyPill}>{canSend?"Ready":"Waiting"}</span></div>
            <ul>
              <li data-ok={Boolean(selectedSender)}>Sender verified</li>
              <li data-ok={Boolean(version)}>Template approved</li>
              <li data-ok={Boolean(to.trim())}>Recipients validated</li>
              <li data-ok={Boolean(runtime?.manualSendEnabled)}>Runtime allows manual send</li>
              <li data-ok>Audit logging enabled</li>
            </ul>
          </section>
          <section className={styles.activityCard}>
            <div className={styles.cardHead}><h3>Recent Activity</h3><button onClick={()=>void load()}>Reload</button></div>
            <div className={styles.auditList}>{audits.slice(0,5).map(m=><article key={m.id}><div><strong>{m.subject}</strong><span>{toLabel(m.toRecipients)||"No recipient"}</span></div><em data-status={m.status}>{m.status}</em><small>{new Date(m.createdAt).toLocaleString()}</small>{m.status==="FAILED"?<button disabled={busy||!runtime?.manualSendEnabled} onClick={()=>void retryMessage(m.id)}>Retry</button>:null}</article>)}{!audits.length?<p className={styles.emptyText}>No manual email audit records yet.</p>:null}</div>
          </section>
        </div>
      </aside>
    </div>

    <div className={styles.deliverySafety}>🛡 <strong>Delivery Safety</strong><span>Runtime mode is {runtime?.mode??"loading"}. Real delivery follows the existing protected runtime configuration.</span></div>
  </section>;
}
