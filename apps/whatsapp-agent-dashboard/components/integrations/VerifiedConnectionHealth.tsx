"use client";

import { useEffect, useState } from "react";

type Provider = "META_WHATSAPP" | "META_INSTAGRAM" | "META_MESSENGER";
type OverallStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "DEGRADED" | "EXPIRED" | "REVOKED";

type VerificationResult = {
  provider: Provider;
  verified: boolean;
  checkedAt: string;
  statusCode: number | null;
  accountReference: string | null;
  reason: string;
  externalWriteSent: false;
  persistedStatus?: OverallStatus | null;
};

type PersistedHealth = {
  provider: Provider;
  externalAccountId: string;
  status: OverallStatus;
  evidence: {
    apiVerifiedAt: string | null;
    webhookRequired: boolean;
    webhookVerifiedAt: string | null;
    permissionsVerified: boolean;
  };
  updatedAt: string;
};

const PROVIDERS: Array<{ provider: Provider; label: string }> = [
  { provider: "META_WHATSAPP", label: "WhatsApp Cloud API" },
  { provider: "META_INSTAGRAM", label: "Instagram" },
  { provider: "META_MESSENGER", label: "Messenger" },
];

export default function VerifiedConnectionHealth() {
  const [busy, setBusy] = useState<Provider | "">("");
  const [results, setResults] = useState<Partial<Record<Provider, VerificationResult>>>({});
  const [health, setHealth] = useState<Partial<Record<Provider, PersistedHealth>>>({});
  const [error, setError] = useState("");

  async function loadHealth() {
    const response = await fetch("/api/integrations/health", { cache: "no-store" });
    const payload = (await response.json()) as { health?: PersistedHealth[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Integration health could not load.");
    const mapped: Partial<Record<Provider, PersistedHealth>> = {};
    for (const item of payload.health || []) mapped[item.provider] = item;
    setHealth(mapped);
  }

  useEffect(() => {
    void loadHealth().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Integration health could not load.");
    });
  }, []);

  async function verify(provider: Provider) {
    setBusy(provider);
    setError("");
    try {
      const response = await fetch("/api/integrations/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const payload = (await response.json()) as VerificationResult & { error?: string };
      if (!response.ok && !payload.provider) {
        throw new Error(payload.error || "Connection verification failed.");
      }
      setResults((current) => ({ ...current, [provider]: payload }));
      await loadHealth();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Connection verification failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="suite-card">
      <header>
        <div>
          <span>Verified connection health</span>
          <h3>Evidence-backed provider state</h3>
          <p>API identity, signed webhook and permission evidence are tracked separately. A provider is never labelled Connected from secret presence alone.</p>
        </div>
      </header>

      {error ? <div className="suite-alert error">{error}</div> : null}

      <div className="suite-list">
        {PROVIDERS.map(({ provider, label }) => {
          const result = results[provider];
          const persisted = health[provider];
          return (
            <article key={provider}>
              <div>
                <strong>{label}</strong>
                <small>
                  {persisted
                    ? `${persisted.status} · API ${persisted.evidence.apiVerifiedAt ? "verified" : "pending"} · webhook ${persisted.evidence.webhookVerifiedAt ? "verified" : "pending"} · permissions ${persisted.evidence.permissionsVerified ? "verified" : "pending"}`
                    : result
                      ? `${result.verified ? "API verified" : "Not verified"} · ${result.reason}`
                      : "No persisted connection evidence yet."}
                </small>
              </div>
              <div className="suite-actions">
                {persisted ? (
                  <span className={persisted.status === "CONNECTED" ? "ok" : "warn"}>{persisted.status}</span>
                ) : null}
                <button
                  type="button"
                  disabled={busy === provider}
                  onClick={() => void verify(provider)}
                >
                  {busy === provider ? "Verifying…" : "Verify connection"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
