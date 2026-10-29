"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "./email-readiness.module.css";

type Overview = {
  inbound?: number; campaigns?: number; sequences?: number; analytics?: number;
  messages?: Record<string, number>; automationEvents?: Record<string, number>;
  providerReadiness?: Array<{provider:string; configured:boolean; registered?:boolean}>;
  guards?: {runtimeMode?:string; externalWritesEnabled?:boolean; inboundSyncEnabled?:boolean; trackingEnabled?:boolean};
};

export default function EmailReadinessDashboard() {
  const [data,setData] = useState<Overview|null>(null);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  const [updated,setUpdated] = useState("");
  const reload=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const response=await fetch("/api/email/platform/overview",{cache:"no-store",credentials:"same-origin"});
      if(!response.ok)throw new Error("Email overview unavailable (HTTP "+response.status+")");
      const payload=await response.json() as Overview;
      if(!payload.guards || !payload.messages || !payload.automationEvents)throw new Error("Overview response missing required fields");
      setData(payload);setUpdated(new Date().toLocaleString("en-IN"));
    }catch(e){setError(e instanceof Error?e.message:"Unable to check Email OS");setData(null)}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{void reload()},[reload]);
  const metrics=[["Inbound messages",data?.inbound],["Campaigns",data?.campaigns],["Sequences",data?.sequences],["Analytics events",data?.analytics]];
  const states=[
    ["Email runtime",data?.guards?.runtimeMode||"Unknown"],
    ["External provider writes",data?.guards?.externalWritesEnabled===true?"Enabled":data?.guards?.externalWritesEnabled===false?"Disabled":"Unknown"],
    ["Inbound synchronization",data?.guards?.inboundSyncEnabled===true?"Enabled":data?.guards?.inboundSyncEnabled===false?"Disabled":"Unknown"],
    ["Tracking",data?.guards?.trackingEnabled===true?"Enabled":data?.guards?.trackingEnabled===false?"Disabled":"Unknown"]
  ];
  return <div className={styles.root}>
    <section className={styles.panel}>
      <div className={styles.heading}><div><span className={styles.eyebrow}>EMAIL OPERATIONS · READ-ONLY</span><h2>Email Readiness &amp; Delivery Evidence</h2><p>Actual workspace records and environment guards. No email sending or configuration changes on this page.</p></div>
        <button type="button" onClick={()=>void reload()} disabled={loading}>{loading?"Checking…":"Refresh status"}</button></div>
      {error?<p role="alert" className={styles.error}>{error}</p>:null}
      {loading&&!data?<p role="status">Loading email status…</p>:null}
      {data?<><p className={styles.note}>Last fetched: {updated}. Configured providers do not prove email delivery.</p>
        <div className={styles.metrics}>{metrics.map(([name,value])=><article key={String(name)}><small>{name}</small><strong>{typeof value==="number"?value.toLocaleString("en-IN"):"—"}</strong><span>Workspace record count</span></article>)}</div></>:null}
    </section>
    {data?<><section className={styles.panel}><h3>Runtime safeguards</h3><div className={styles.rows}>{states.map(([name,state])=><div className={styles.row} key={name}><strong>{name}</strong><span>{state}</span></div>)}</div>
      <p className={styles.note}>This interface does not activate disabled guards or start sending.</p></section>
      <section className={styles.panel}><h3>Recorded message states</h3><div className={styles.rows}>{Object.entries(data.messages||{}).map(([key,count])=><div className={styles.row} key={key}><strong>{key}</strong><span>{count.toLocaleString("en-IN")}</span></div>)}{!Object.keys(data.messages||{}).length?<p>No message records available.</p>:null}</div>
        <h3>Automation event states</h3><div className={styles.rows}>{Object.entries(data.automationEvents||{}).map(([key,count])=><div className={styles.row} key={key}><strong>{key}</strong><span>{count.toLocaleString("en-IN")}</span></div>)}</div>
        <h3>Provider configuration</h3><div className={styles.rows}>{(data.providerReadiness||[]).map(x=><div className={styles.row} key={x.provider}><strong>{x.provider}</strong><span>{x.configured?"Configured · delivery not verified":"Not configured"}</span></div>)}</div>
      </section></>:null}
  </div>
}
