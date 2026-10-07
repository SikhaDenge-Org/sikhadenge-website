"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./email-sender-manager.module.css";

type Connection = {
  id:string; workspaceId:string; provider:string; displayName:string; externalAccountId:string|null;
  status:string; connectedAt:string|null; lastVerifiedAt:string|null; revokedAt:string|null;
};
type Sender = {
  id:string; workspaceId:string; connectionId:string; provider:string; fromName:string; fromEmail:string;
  replyToEmail:string|null; verificationStatus:string; isProviderDefault:boolean; isWorkspaceDefault:boolean;
  isActive:boolean; dailyLimit:number|null;
};
type EmailState = { workspace:{id:string;slug:string}; connections:Connection[]; senders:Sender[] };
type InboxHealth = { activationAccount:string; activationWorkspaceId:string; currentWorkspaceId:string; activationWorkspaceReady:boolean; activationConnectionReady:boolean; gmailConnected:boolean; connectedGmailConnections:number; matchingActivationConnections:number; readAccess:boolean; readAccessStatus:"AUTHORIZED"|"NEEDS_AUTHORIZATION"|"WRONG_WORKSPACE"; statusCode:number; probeError:string; inboundSyncEnabled:boolean; inboundMode:string; cursorReadyConnections:number };
type ActionState = { key:string; message:string; kind:"working"|"success"|"error" } | null;

async function apiJson<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,{...init,headers:{...(init?.body?{"content-type":"application/json"}:{}),...init?.headers},cache:"no-store"});
  const payload=(await response.json().catch(()=>({}))) as Record<string,unknown>;
  if(!response.ok)throw new Error(typeof payload.error==="string"?payload.error:`Request failed (${response.status}).`);
  return payload as T;
}
function providerLabel(provider:string){return provider==="GOOGLE_GMAIL"?"Google Workspace":provider==="MICROSOFT_365"?"Microsoft 365":provider.replaceAll("_"," ");}
function compactDate(value:string|null){if(!value)return "Not available";const d=new Date(value);return Number.isNaN(d.getTime())?"Not available":new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(d);}
function relativeDate(value:string|null){if(!value)return "Not yet";const t=new Date(value).getTime();if(Number.isNaN(t))return "Not yet";const ms=Date.now()-t;if(ms<60000)return "Just now";if(ms<3600000)return `${Math.floor(ms/60000)}m ago`;if(ms<86400000)return `${Math.floor(ms/3600000)}h ago`;return `${Math.floor(ms/86400000)}d ago`;}

export default function EmailSenderManager(){
  const [state,setState]=useState<EmailState|null>(null);
  const [inboxHealth,setInboxHealth]=useState<InboxHealth|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [action,setAction]=useState<ActionState>(null);

  const load=useCallback(async()=>{try{setError(null);const [nextState,nextHealth]=await Promise.all([apiJson<EmailState>("/api/email/connections"),apiJson<InboxHealth>("/api/email/inbound/health").catch(()=>null)]);setState(nextState);setInboxHealth(nextHealth);}catch(e){setError(e instanceof Error?e.message:"Email state could not be loaded.");}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(typeof window==="undefined")return;const params=new URLSearchParams(window.location.search);if(params.get("email")!=="connected")return;void (async()=>{try{const next=await apiJson<InboxHealth>("/api/email/inbound/health");setInboxHealth(next);setAction({key:"inbox-recheck",message:next.readAccess?"Google connection returned. Inbox access is authorized.":!next.activationWorkspaceReady?`Google connection returned, but production Inbox activation is pinned to workspace ${next.activationWorkspaceId}.`:"Google connection returned, but Inbox access still needs authorization.",kind:next.readAccess?"success":"error"});}catch(e){setAction({key:"inbox-recheck",message:e instanceof Error?e.message:"Google connection returned, but Inbox authorization could not be verified.",kind:"error"});}})();},[]);

  const activeConnections=useMemo(()=>state?.connections.filter(c=>c.status!=="REVOKED")??[],[state]);
  const verifiedSenders=useMemo(()=>state?.senders.filter(s=>s.verificationStatus==="VERIFIED"&&s.isActive)??[],[state]);
  const workspaceDefault=useMemo(()=>verifiedSenders.find(s=>s.isWorkspaceDefault)??null,[verifiedSenders]);
  const primaryConnection=activeConnections[0]??null;
  const primarySenders=primaryConnection?state?.senders.filter(s=>s.connectionId===primaryConnection.id)??[]:[];

  async function connectGoogle(){try{setAction({key:"connect",message:"Preparing secure Google connection…",kind:"working"});const result=await apiJson<{authorizationUrl:string}>("/api/email/google/connect",{method:"POST"});window.location.assign(result.authorizationUrl);}catch(e){setAction({key:"connect",message:e instanceof Error?e.message:"Google connection could not start.",kind:"error"});}}
  async function enableInboxAccess(){try{setAction({key:"inbox-access",message:"Preparing Google read-only Inbox authorization…",kind:"working"});const result=await apiJson<{authorizationUrl:string}>("/api/email/google/connect",{method:"POST",body:JSON.stringify({enableInbound:true})});window.location.assign(result.authorizationUrl);}catch(e){setAction({key:"inbox-access",message:e instanceof Error?e.message:"Inbox access authorization could not start.",kind:"error"});}}
  async function recheckInboxAccess(){try{setAction({key:"inbox-recheck",message:"Checking live Gmail Inbox authorization…",kind:"working"});const next=await apiJson<InboxHealth>("/api/email/inbound/health");setInboxHealth(next);setAction({key:"inbox-recheck",message:next.readAccess?"Inbox access is authorized.":!next.activationWorkspaceReady?`Production Inbox activation is pinned to workspace ${next.activationWorkspaceId}; current workspace is ${next.currentWorkspaceId}.`:"Inbox access still needs Google authorization.",kind:next.readAccess?"success":"error"});}catch(e){setAction({key:"inbox-recheck",message:e instanceof Error?e.message:"Inbox authorization could not be checked.",kind:"error"});}}
  async function refreshConnection(id:string){try{setAction({key:`refresh:${id}`,message:"Refreshing sender identities…",kind:"working"});await apiJson(`/api/email/connections/${encodeURIComponent(id)}/refresh`,{method:"POST"});await load();setAction({key:`refresh:${id}`,message:"Sender identities refreshed.",kind:"success"});}catch(e){setAction({key:`refresh:${id}`,message:e instanceof Error?e.message:"Sender refresh failed.",kind:"error"});}}
  async function chooseDefault(id:string){try{setAction({key:`default:${id}`,message:"Updating workspace default…",kind:"working"});await apiJson("/api/email/senders/default",{method:"POST",body:JSON.stringify({senderIdentityId:id})});await load();setAction({key:`default:${id}`,message:"Workspace default sender updated.",kind:"success"});}catch(e){setAction({key:`default:${id}`,message:e instanceof Error?e.message:"Default sender update failed.",kind:"error"});}}
  async function disconnect(connection:Connection){if(!window.confirm(`Disconnect ${connection.displayName}? Stored OAuth credentials will be revoked.`))return;try{setAction({key:`revoke:${connection.id}`,message:"Revoking Google access…",kind:"working"});await apiJson(`/api/email/connections/${encodeURIComponent(connection.id)}`,{method:"DELETE"});await load();setAction({key:`revoke:${connection.id}`,message:"Email account disconnected.",kind:"success"});}catch(e){setAction({key:`revoke:${connection.id}`,message:e instanceof Error?e.message:"Email account could not be disconnected.",kind:"error"});}}

  if(loading)return <div className={styles.loading}>Loading Email Accounts…</div>;

  return <section className={styles.root} aria-label="Email Accounts workspace">
    <div className={styles.statusRail}>
      <span className={activeConnections.length?styles.connectedPill:styles.neutralPill}>● {activeConnections.length?"Connected":"Not connected"}</span>
      <span className={styles.protectedPill}>🛡 Protected OAuth</span>
      {primaryConnection?.provider==="GOOGLE_GMAIL"?<button type="button" onClick={()=>void enableInboxAccess()} disabled={action?.kind==="working"||inboxHealth?.activationWorkspaceReady===false} title={inboxHealth?.activationWorkspaceReady===false?`Switch to ${inboxHealth.activationWorkspaceId} to authorize Inbox access.`:undefined}>Enable Inbox Access</button>:null}
      <button className={styles.primaryButton} type="button" onClick={()=>void connectGoogle()}><span className={styles.googleMark}>G</span>{activeConnections.length?"Add another account":"Connect Google account"}</button>
    </div>

    {error?<div className={styles.errorBanner}>{error}</div>:null}
    {action?<div className={`${styles.actionBanner} ${styles[action.kind]}`}>{action.message}</div>:null}
    {primaryConnection?.provider==="GOOGLE_GMAIL"?<div className={`${styles.inboxAccessNotice} ${inboxHealth?.readAccess?styles.inboxAccessReady:styles.inboxAccessBlocked}`}>
      <div><strong>{inboxHealth?.readAccess?"Inbox access authorized":inboxHealth&&!inboxHealth.activationWorkspaceReady?"Wrong workspace for production activation":"Inbox access requires Google authorization"}</strong><span>{inboxHealth?.readAccess?`Google read-only access is active for ${inboxHealth.activationAccount} in ${inboxHealth.activationWorkspaceId}. Mode: ${inboxHealth.inboundMode}. Cursor-ready: ${inboxHealth.cursorReadyConnections}.`:inboxHealth&&!inboxHealth.activationWorkspaceReady?`Production Gmail inbound is pinned to ${inboxHealth.activationWorkspaceId}; current workspace is ${inboxHealth.currentWorkspaceId}. Switch to the activation workspace before authorizing or rechecking Inbox access.`:inboxHealth?.statusCode===403?`Google returned HTTP 403 for ${inboxHealth.activationAccount}. Approve read-only Gmail access to enable incoming email sync.`:inboxHealth&&!inboxHealth.activationConnectionReady?`Expected one connected Gmail sender for ${inboxHealth.activationAccount}; found ${inboxHealth.matchingActivationConnections}.`:"Sending access and Inbox read access are separate. Approve Google read-only Gmail access for incoming email sync."}</span></div>
      <span className={styles.inboxAccessStatus}>{inboxHealth?.readAccess?"AUTHORIZED":inboxHealth&&!inboxHealth.activationWorkspaceReady?"WRONG WORKSPACE":"NEEDS AUTHORIZATION"}</span>
      <div className={styles.inboxAccessActions}>
        <button type="button" onClick={()=>void recheckInboxAccess()} disabled={action?.kind==="working"}>{action?.key==="inbox-recheck"&&action.kind==="working"?"Checking…":"Recheck Inbox Access"}</button>
        {!inboxHealth?.readAccess&&inboxHealth?.activationWorkspaceReady!==false?<button type="button" onClick={()=>void enableInboxAccess()} disabled={action?.kind==="working"}>{action?.key==="inbox-access"&&action.kind==="working"?"Opening Google…":"Enable Inbox Access"}</button>:null}
      </div>
    </div>:null}

    {primaryConnection ? <article className={styles.accountHero}>
      <div className={styles.googleLogo}>G</div>
      <div className={styles.accountIdentity}>
        <div><strong>{workspaceDefault?.fromEmail??primaryConnection.displayName}</strong>{workspaceDefault?<span>Primary</span>:null}</div>
        <p>{providerLabel(primaryConnection.provider)} · {state?.workspace.slug}</p>
        <small>Connected {compactDate(primaryConnection.connectedAt)} · Last verified {relativeDate(primaryConnection.lastVerifiedAt)}</small>
      </div>
      <div className={styles.accountHealth}><span>OAuth status</span><strong>{primaryConnection.status}</strong><small>Server-side protected connection</small></div>
      <div className={styles.accountHealth}><span>Sender identities</span><strong>{primarySenders.length}</strong><small>Discovered from provider</small></div>
      <button className={styles.iconButton} onClick={()=>void refreshConnection(primaryConnection.id)} disabled={action?.kind==="working"}>↻</button>
    </article> : <div className={styles.emptyState}><div className={styles.emptyIcon}>@</div><h3>No email account connected</h3><p>Connect your Google Workspace account. OAuth tokens stay server-side and encrypted before persistence.</p><button className={styles.primaryButton} onClick={()=>void connectGoogle()}>Connect first account</button></div>}

    <div className={styles.metrics}>
      <article><span className={styles.metricIconBlue}>◎</span><div><small>Verified senders</small><strong>{verifiedSenders.length}</strong><p>Primary + aliases</p></div></article>
      <article><span className={styles.metricIconBlue}>✉</span><div><small>Workspace default</small><strong className={styles.metricEmail}>{workspaceDefault?.fromEmail??"Not selected"}</strong><p>Templates & automations</p></div></article>
      <article><span className={styles.metricIconGreen}>➤</span><div><small>Sender status</small><strong>{workspaceDefault?.verificationStatus??"Pending"}</strong><p>{workspaceDefault?.isActive?"Ready to use":"Requires verified sender"}</p></div></article>
      <article><span className={styles.metricIconPurple}>◫</span><div><small>Provider connections</small><strong>{activeConnections.length}</strong><p>Real active connections</p></div></article>
    </div>

    <div className={styles.mainGrid}>
      <section className={styles.sendersCard}>
        <div className={styles.cardHead}><div><h3>Senders & aliases</h3><p>Manage verified email identities discovered from connected providers.</p></div><button onClick={()=>void connectGoogle()}>+ Add account</button></div>
        <div className={styles.senderTable}>
          <div className={styles.tableHead}><span>EMAIL ADDRESS</span><span>TYPE</span><span>STATUS</span><span>ACTIONS</span></div>
          {state?.senders.length?state.senders.map(sender=><div className={styles.senderTableRow} key={sender.id}>
            <span><i>{sender.isWorkspaceDefault?"★":"✉"}</i><div><strong>{sender.fromEmail}</strong><small>{sender.fromName}</small></div>{sender.isWorkspaceDefault?<em>Default</em>:null}</span>
            <span>{sender.isProviderDefault?"Primary":"Alias"}</span>
            <span className={sender.verificationStatus==="VERIFIED"?styles.good:styles.warn}>● {sender.verificationStatus}</span>
            <span>{!sender.isWorkspaceDefault&&sender.verificationStatus==="VERIFIED"&&sender.isActive?<button onClick={()=>void chooseDefault(sender.id)} disabled={action?.kind==="working"}>Set default</button>:<b>—</b>}</span>
          </div>):<div className={styles.tableEmpty}>No sender identities discovered yet.</div>}
        </div>
      </section>

      <section className={styles.detailsCard}>
        <div className={styles.cardHead}><div><h3>Account details</h3><p>{primaryConnection?providerLabel(primaryConnection.provider):"No provider connected"}</p></div></div>
        {primaryConnection?<dl>
          <div><dt>Account name</dt><dd>{primaryConnection.displayName}</dd></div>
          <div><dt>Provider</dt><dd>{providerLabel(primaryConnection.provider)}</dd></div>
          <div><dt>Status</dt><dd>{primaryConnection.status}</dd></div>
          <div><dt>Connected</dt><dd>{compactDate(primaryConnection.connectedAt)}</dd></div>
          <div><dt>Last verified</dt><dd>{compactDate(primaryConnection.lastVerifiedAt)}</dd></div>
          <div><dt>External account ID</dt><dd>{primaryConnection.externalAccountId??"Provider-managed"}</dd></div>
        </dl>:<p className={styles.panelEmpty}>Connect an account to view provider details.</p>}
        {primaryConnection?<div className={styles.detailActions}>{primaryConnection.provider==="GOOGLE_GMAIL"?<button onClick={()=>void enableInboxAccess()} disabled={action?.kind==="working"}>Enable Inbox Access</button>:null}<button onClick={()=>void refreshConnection(primaryConnection.id)} disabled={action?.kind==="working"}>↻ Refresh aliases</button><button className={styles.dangerButton} onClick={()=>void disconnect(primaryConnection)} disabled={action?.kind==="working"}>Disconnect</button></div>:null}
      </section>
    </div>

    <div className={styles.securityGrid}>
      <section className={styles.securityCard}><div className={styles.cardHead}><div><h3>Authentication & connection health</h3><p>Only states exposed by the current provider integration are shown.</p></div></div><div className={styles.securityItems}><span><i>🛡</i><b>OAuth connection</b><strong>{primaryConnection?.status??"Not connected"}</strong><small>Credentials stored server-side</small></span><span><i>✓</i><b>Verified identities</b><strong>{verifiedSenders.length}</strong><small>Active provider send-as identities</small></span><span><i>↻</i><b>Last verification</b><strong>{relativeDate(primaryConnection?.lastVerifiedAt??null)}</strong><small>{compactDate(primaryConnection?.lastVerifiedAt??null)}</small></span></div></section>
      <section className={styles.permissionsCard}><div className={styles.cardHead}><div><h3>OAuth protection</h3><p>Security properties supported by the current implementation.</p></div></div><ul><li>✓ OAuth tokens remain server-side</li><li>✓ Stored credentials are encrypted before persistence</li><li>✓ Connection can be revoked from this workspace</li><li>✓ Inbox access uses explicit Google read-only consent</li></ul></section>
    </div>

    <div className={styles.bottomGrid}>
      <section className={styles.activityCard}><div className={styles.cardHead}><div><h3>Recent account activity</h3><p>Connection lifecycle timestamps from real account state.</p></div></div>{activeConnections.map(c=><div className={styles.activityRow} key={c.id}><span>✓</span><div><strong>{c.displayName}</strong><small>Connected {compactDate(c.connectedAt)} · Verified {compactDate(c.lastVerifiedAt)}</small></div><time>{relativeDate(c.lastVerifiedAt??c.connectedAt)}</time></div>)}{!activeConnections.length?<p className={styles.panelEmpty}>No account activity yet.</p>:null}</section>
      <section className={styles.healthCard}><div className={styles.cardHead}><div><h3>Connection health</h3><p>Based on current provider status and verified senders.</p></div><span className={primaryConnection?.status==="CONNECTED"?styles.healthy:styles.warning}>{primaryConnection?.status==="CONNECTED"?"Healthy":"Needs setup"}</span></div><div className={styles.healthBody}><div className={styles.healthRing}><span><b>{verifiedSenders.length}</b><small>verified senders</small></span></div><dl><div><dt>Provider status</dt><dd>{primaryConnection?.status??"Not connected"}</dd></div><div><dt>Workspace default</dt><dd>{workspaceDefault?.fromEmail??"Not selected"}</dd></div><div><dt>Active identities</dt><dd>{verifiedSenders.length}</dd></div></dl></div></section>
    </div>
  </section>;
}
