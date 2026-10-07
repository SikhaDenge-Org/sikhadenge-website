"use client";

import { useState } from "react";

type Result = {
  verified: boolean;
  checkedAt: string;
  accountId: string | null;
  probeMediaId: string | null;
  statusCode: number | null;
  reason: string;
  externalWriteSent: false;
  integrationStatus?: string | null;
};

export default function InstagramCommentCapabilityHealth() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function verify() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/integrations/instagram/comments/verify", { method: "POST" });
      const payload = (await response.json()) as Result & { error?: string };
      if (!response.ok && typeof payload.verified !== "boolean") {
        throw new Error(payload.error || "Instagram comment permission verification failed.");
      }
      setResult(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Instagram comment permission verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="suite-card">
      <header>
        <div>
          <span>Instagram comments capability</span>
          <h3>Verify manage-comments permission safely</h3>
          <p>This probe performs GET-only media and comment-edge requests. It never posts a comment, DM or campaign.</p>
        </div>
      </header>
      {error ? <div className="suite-alert error">{error}</div> : null}
      <div className="suite-list">
        <article>
          <div>
            <strong>Instagram comment management</strong>
            <small>{result ? `${result.verified ? "Verified" : "Not verified"} · ${result.reason}` : "Permission has not been verified in this browser session."}</small>
          </div>
          <div className="suite-actions">
            {result ? <span className={result.verified ? "ok" : "warn"}>{result.verified ? `Permission verified${result.integrationStatus ? ` · ${result.integrationStatus}` : ""}` : "Verification required"}</span> : null}
            <button type="button" disabled={busy} onClick={() => void verify()}>{busy ? "Verifying…" : "Verify comments permission"}</button>
          </div>
        </article>
      </div>
    </section>
  );
}
