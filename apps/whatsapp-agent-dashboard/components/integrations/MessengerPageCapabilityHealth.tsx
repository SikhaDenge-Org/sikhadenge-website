"use client";

import { useState } from "react";

type Result = {
  verified: boolean;
  checkedAt: string;
  pageId: string | null;
  pageName: string | null;
  conversationReadVerified: boolean;
  commentReadVerified: boolean;
  probePostId: string | null;
  statusCode: number | null;
  reason: string;
  externalWriteSent: false;
  integrationStatus?: string | null;
};

export default function MessengerPageCapabilityHealth() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function verify() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/messenger/page/verify", { method: "POST" });
      const payload = (await response.json()) as Result & { error?: string };
      if (!response.ok && typeof payload.verified !== "boolean") {
        throw new Error(payload.error || "Messenger Page capability verification failed.");
      }
      setResult(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Messenger Page capability verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="suite-card">
      <header>
        <div>
          <span>Facebook Page + Messenger capability</span>
          <h3>Verify Page messaging and comment reads safely</h3>
          <p>This probe uses GET-only Page identity, conversation, post and comment requests. It never sends a DM or comment.</p>
        </div>
      </header>
      {error ? <div className="suite-alert error">{error}</div> : null}
      <div className="suite-list">
        <article>
          <div>
            <strong>Messenger Page connection</strong>
            <small>{result ? `${result.verified ? "Verified" : "Not verified"} · ${result.reason}` : "Capability has not been verified in this browser session."}</small>
          </div>
          <div className="suite-actions">
            {result ? <span className={result.verified ? "ok" : "warn"}>{result.verified ? `Read capability verified${result.integrationStatus ? ` · ${result.integrationStatus}` : ""}` : "Verification required"}</span> : null}
            <button type="button" disabled={busy} onClick={() => void verify()}>{busy ? "Verifying…" : "Verify Page capability"}</button>
          </div>
        </article>
      </div>
    </section>
  );
}
