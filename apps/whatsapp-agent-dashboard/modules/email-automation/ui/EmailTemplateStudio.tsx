"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./email-template-studio.module.css";

type Status = "DRAFT" | "IN_REVIEW" | "APPROVED" | "ARCHIVED";
type Block = { id:string; type:"HEADING"|"TEXT"|"IMAGE"|"BUTTON"|"DIVIDER"|"SPACER"; text?:string; level?:1|2|3; align?:"LEFT"|"CENTER"|"RIGHT"; src?:string; alt?:string; label?:string; url?:string; height?:number; color?:string; thickness?:number };
type Variable = { key:string; label:string; required:boolean; fallback?:string };
type Document = { subject:string; preheader:string|null; blocks:Block[]; variables:Variable[] };
type Summary = { id:string; name:string; category:string; status:Status; currentVersion:number; defaultSenderIdentityId:string|null; updatedAt:string };
type Version = { id:string; version:number; subject:string; preheader:string|null; document:Document; defaultSenderIdentityId:string|null; createdAt:string };
type Detail = Summary & { versions:Version[] };
type Sender = { id:string; fromName:string; fromEmail:string; verificationStatus:string; isActive:boolean; isWorkspaceDefault:boolean };

const CATEGORIES = ["TRANSACTIONAL","LEAD_WELCOME","MASTERCLASS","ADMISSION","FOLLOW_UP","PAYMENT","APPOINTMENT","NURTURE","RE_ENGAGEMENT","CUSTOM"];
const starterBlocks: Block[] = [
  { id:"heading-1", type:"HEADING", text:"Welcome to SikhaDenge", level:1, align:"LEFT" },
  { id:"text-1", type:"TEXT", text:"Hi {{first_name}}, thanks for connecting with us. We are ready to help you with your next step.", align:"LEFT" },
  { id:"button-1", type:"BUTTON", label:"View details", url:"https://sikhadenge.in", align:"LEFT" },
];

async function api<T>(url:string, init?:RequestInit):Promise<T>{
  const response=await fetch(url,{...init,headers:{...(init?.body?{"content-type":"application/json"}:{}),...init?.headers},cache:"no-store"});
  const data=await response.json().catch(()=>({})) as Record<string,unknown>;
  if(!response.ok) throw new Error(typeof data.error==="string"?data.error:`Request failed (${response.status}).`);
  return data as T;
}
const uid=(prefix:string)=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

function blankDocument():Document{return {subject:"Welcome to SikhaDenge",preheader:"Your SikhaDenge update",blocks:starterBlocks.map(b=>({...b,id:uid(b.type.toLowerCase())})),variables:[{key:"first_name",label:"First name",required:false,fallback:"there"}]};}

export default function EmailTemplateStudio(){
  const [templates,setTemplates]=useState<Summary[]>([]); const [senders,setSenders]=useState<Sender[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null); const [detail,setDetail]=useState<Detail|null>(null);
  const [name,setName]=useState("New email template"); const [category,setCategory]=useState("LEAD_WELCOME");
  const [senderId,setSenderId]=useState(""); const [document,setDocument]=useState<Document>(blankDocument());
  const [query,setQuery]=useState(""); const [preview,setPreview]=useState<"DESKTOP"|"MOBILE">("DESKTOP");
  const [busy,setBusy]=useState(false); const [notice,setNotice]=useState<{kind:"ok"|"error";text:string}|null>(null);

  const loadTemplates=useCallback(async()=>{const r=await api<{templates:Summary[]}>("/api/email/templates");setTemplates(r.templates);},[]);
  const loadSenders=useCallback(async()=>{const r=await api<{senders:Sender[]}>("/api/email/connections");setSenders(r.senders.filter(s=>s.verificationStatus==="VERIFIED"&&s.isActive));},[]);
  useEffect(()=>{void Promise.all([loadTemplates(),loadSenders()]).catch(e=>setNotice({kind:"error",text:e instanceof Error?e.message:"Could not load Template Studio."}));},[loadTemplates,loadSenders]);

  const filtered=useMemo(()=>templates.filter(t=>`${t.name} ${t.category} ${t.status}`.toLowerCase().includes(query.toLowerCase())),[templates,query]);
  const current=detail?.versions.find(v=>v.version===detail.currentVersion)??null;
  const editable=!detail||detail.status==="DRAFT";

  function resetNew(){setSelectedId(null);setDetail(null);setName("New email template");setCategory("LEAD_WELCOME");setSenderId(senders.find(s=>s.isWorkspaceDefault)?.id??"");setDocument(blankDocument());setNotice(null);}
  async function selectTemplate(id:string){setBusy(true);try{const r=await api<{template:Detail}>(`/api/email/templates/${id}`);setSelectedId(id);setDetail(r.template);setName(r.template.name);setCategory(r.template.category);const v=r.template.versions.find(x=>x.version===r.template.currentVersion);if(v){setDocument(v.document);setSenderId(v.defaultSenderIdentityId??"");}setNotice(null);}catch(e){setNotice({kind:"error",text:e instanceof Error?e.message:"Template could not load."});}finally{setBusy(false);}}
  function updateBlock(id:string,patch:Partial<Block>){setDocument(d=>({...d,blocks:d.blocks.map(b=>b.id===id?{...b,...patch}:b)}));}
  function addBlock(type:Block["type"]){const base:Block=type==="HEADING"?{id:uid("heading"),type,text:"New heading",level:2}:type==="TEXT"?{id:uid("text"),type,text:"Write your message here."}:type==="BUTTON"?{id:uid("button"),type,label:"Call to action",url:"https://sikhadenge.in"}:type==="IMAGE"?{id:uid("image"),type,src:"",alt:"Email image"}:type==="DIVIDER"?{id:uid("divider"),type,color:"#dbe5f4",thickness:1}:{id:uid("spacer"),type,height:24};setDocument(d=>({...d,blocks:[...d.blocks,base]}));}
  function removeBlock(id:string){setDocument(d=>({...d,blocks:d.blocks.filter(b=>b.id!==id)}));}

  async function save(){setBusy(true);setNotice(null);try{if(!detail){const r=await api<{template:Detail}>("/api/email/templates",{method:"POST",body:JSON.stringify({name,category,document,defaultSenderIdentityId:senderId||null})});setDetail(r.template);setSelectedId(r.template.id);setNotice({kind:"ok",text:"Template created as Draft v1."});}else{const r=await api<{template:Detail}>(`/api/email/templates/${detail.id}`,{method:"PATCH",body:JSON.stringify({expectedCurrentVersion:detail.currentVersion,document,defaultSenderIdentityId:senderId||null})});setDetail(r.template);setNotice({kind:"ok",text:`Draft v${r.template.currentVersion} saved.`});}await loadTemplates();}catch(e){setNotice({kind:"error",text:e instanceof Error?e.message:"Template could not be saved."});}finally{setBusy(false);}}
  async function transition(status:Status){if(!detail)return;setBusy(true);try{const r=await api<{template:Detail}>(`/api/email/templates/${detail.id}/status`,{method:"POST",body:JSON.stringify({status})});setDetail(r.template);await loadTemplates();setNotice({kind:"ok",text:`Template moved to ${status.replaceAll("_"," ")}.`});}catch(e){setNotice({kind:"error",text:e instanceof Error?e.message:"Status update failed."});}finally{setBusy(false);}}

  return <section className={styles.root} aria-label="Advanced Email Template Studio">
    <header className={styles.hero}><div><span>EMAIL AUTOMATION · E2</span><h2>Advanced Template Studio</h2><p>Build reusable, versioned email experiences with sender control, live previews and approval gates.</p></div><div className={styles.heroActions}><button onClick={resetNew}>+ New template</button><button className={styles.primary} disabled={!editable||busy} onClick={()=>void save()}>{busy?"Working…":detail?"Save new version":"Create draft"}</button></div></header>
    {notice?<div className={notice.kind==="ok"?styles.ok:styles.error}>{notice.text}</div>:null}
    <div className={styles.metrics}><article><span>Total templates</span><strong>{templates.length}</strong></article><article><span>Approved</span><strong>{templates.filter(t=>t.status==="APPROVED").length}</strong></article><article><span>Verified senders</span><strong>{senders.length}</strong></article><article><span>Delivery</span><strong className={styles.lock}>LOCKED · E3</strong></article></div>
    <div className={styles.workspace}>
      <aside className={styles.library}><div className={styles.panelTitle}><div><span>LIBRARY</span><h3>Templates</h3></div><button onClick={()=>void loadTemplates()}>↻</button></div><input className={styles.search} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search templates…" />
        <div className={styles.templateList}>{filtered.length?filtered.map(t=><button key={t.id} className={`${styles.templateCard} ${selectedId===t.id?styles.selected:""}`} onClick={()=>void selectTemplate(t.id)}><div><strong>{t.name}</strong><span>{t.category.replaceAll("_"," ")}</span></div><em data-status={t.status}>{t.status.replaceAll("_"," ")}</em><small>v{t.currentVersion}</small></button>):<div className={styles.empty}>No templates yet. Create your first draft.</div>}</div>
      </aside>
      <main className={styles.editor}>
        <div className={styles.editorHead}><div><span>EDITOR</span><h3>{detail?name:"New template"}</h3></div>{detail?<div className={styles.statusBar}><b>{detail.status.replaceAll("_"," ")}</b><span>v{detail.currentVersion}</span></div>:null}</div>
        <div className={styles.formGrid}><label>Template name<input value={name} disabled={Boolean(detail)} onChange={e=>setName(e.target.value)} /></label><label>Category<select value={category} disabled={Boolean(detail)} onChange={e=>setCategory(e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><label className={styles.wide}>From sender<select value={senderId} disabled={!editable} onChange={e=>setSenderId(e.target.value)}><option value="">Workspace default at send time</option>{senders.map(s=><option key={s.id} value={s.id}>{s.fromName} · {s.fromEmail}{s.isWorkspaceDefault?" · Default":""}</option>)}</select></label><label className={styles.wide}>Subject<input value={document.subject} disabled={!editable} onChange={e=>setDocument(d=>({...d,subject:e.target.value}))} /></label><label className={styles.wide}>Preheader<input value={document.preheader??""} disabled={!editable} onChange={e=>setDocument(d=>({...d,preheader:e.target.value||null}))} /></label></div>
        <div className={styles.blockToolbar}><span>Add content</span>{(["HEADING","TEXT","BUTTON","IMAGE","DIVIDER","SPACER"] as Block["type"][]).map(t=><button key={t} disabled={!editable} onClick={()=>addBlock(t)}>+ {t.toLowerCase()}</button>)}</div>
        <div className={styles.blocks}>{document.blocks.map((b,i)=><article className={styles.block} key={b.id}><div className={styles.blockTop}><span>{String(i+1).padStart(2,"0")} · {b.type}</span>{editable?<button onClick={()=>removeBlock(b.id)}>Remove</button>:null}</div>{b.type==="HEADING"||b.type==="TEXT"?<textarea disabled={!editable} value={b.text??""} onChange={e=>updateBlock(b.id,{text:e.target.value})}/>:null}{b.type==="BUTTON"?<><input disabled={!editable} value={b.label??""} onChange={e=>updateBlock(b.id,{label:e.target.value})} placeholder="Button label"/><input disabled={!editable} value={b.url??""} onChange={e=>updateBlock(b.id,{url:e.target.value})} placeholder="https://…"/></>:null}{b.type==="IMAGE"?<><input disabled={!editable} value={b.src??""} onChange={e=>updateBlock(b.id,{src:e.target.value})} placeholder="Image URL / media asset URL"/><input disabled={!editable} value={b.alt??""} onChange={e=>updateBlock(b.id,{alt:e.target.value})} placeholder="Alt text"/></>:null}{b.type==="SPACER"?<input disabled={!editable} type="number" min={8} max={120} value={b.height??24} onChange={e=>updateBlock(b.id,{height:Number(e.target.value)})}/>:null}{b.type==="DIVIDER"?<span className={styles.dividerSample}/>:null}</article>)}</div>
        {detail?<div className={styles.lifecycle}><span>Lifecycle</span>{detail.status==="DRAFT"?<button onClick={()=>void transition("IN_REVIEW")}>Submit for review</button>:null}{detail.status==="IN_REVIEW"?<><button onClick={()=>void transition("DRAFT")}>Return to draft</button><button className={styles.primary} onClick={()=>void transition("APPROVED")}>Approve template</button></>:null}{detail.status==="APPROVED"?<button onClick={()=>void transition("ARCHIVED")}>Archive</button>:null}</div>:null}
      </main>
      <aside className={styles.preview}><div className={styles.previewHead}><div><span>LIVE PREVIEW</span><h3>{preview==="DESKTOP"?"Desktop":"Mobile"}</h3></div><div><button className={preview==="DESKTOP"?styles.active:""} onClick={()=>setPreview("DESKTOP")}>Desktop</button><button className={preview==="MOBILE"?styles.active:""} onClick={()=>setPreview("MOBILE")}>Mobile</button></div></div><div className={`${styles.device} ${preview==="MOBILE"?styles.mobile:""}`}><div className={styles.mailChrome}><span>From</span><strong>{senders.find(s=>s.id===senderId)?.fromEmail??senders.find(s=>s.isWorkspaceDefault)?.fromEmail??"workspace default"}</strong><span>Subject</span><strong>{document.subject||"Untitled email"}</strong><small>{document.preheader}</small></div><div className={styles.canvas}>{document.blocks.map(b=>b.type==="HEADING"?<h2 key={b.id}>{b.text}</h2>:b.type==="TEXT"?<p key={b.id}>{b.text}</p>:b.type==="BUTTON"?<a key={b.id}>{b.label}</a>:b.type==="IMAGE"?(b.src?<img key={b.id} src={b.src} alt={b.alt??""}/>:<div key={b.id} className={styles.imagePlaceholder}>IMAGE</div>):b.type==="DIVIDER"?<hr key={b.id}/>:<div key={b.id} style={{height:b.height??24}} />)}</div></div>{current?<div className={styles.versionInfo}><strong>Current immutable snapshot</strong><span>Version {current.version} · created {new Date(current.createdAt).toLocaleString()}</span></div>:null}</aside>
    </div>
  </section>;
}
