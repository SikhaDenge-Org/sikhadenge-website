"use client";

import { FormEvent, useEffect, useState } from "react";

type Provider = {
  provider: string;
  label: string;
  description: string;
  secretEnvironment: string[];
  externalWriteLock: string | null;
  secrets: Array<{ name: string; configured: boolean }>;
  secretsConfigured: boolean;
  externalWriteEnabled: boolean;
};

type Configuration = {
  id: string;
  provider: string;
  name: string;
  enabled: boolean;
  endpointUrl: string | null;
  accountReference: string | null;
  notes: string | null;
  status: string;
  lastTestedAt: string | null;
  lastTestResult: string | null;
};

type Overview = {
  providers: Provider[];
  configurations: Configuration[];
  externalWritesGloballyEnabled: boolean;
  generatedAt: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function humanise(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatDate(value: string | null) {
  if (!value) return "Not tested";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function IntegrationsManager() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [form, setForm] = useState({
    id: "",
    provider: "META_WHATSAPP",
    name: "",
    enabled: false,
    endpointUrl: "",
    accountReference: "",
    notes: "",
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    const response = await fetch("/api/integrations", { cache: "no-store" });
    setOverview(await readJson<Overview>(response));
  }

  useEffect(() => {
    void load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Integrations could not load.");
    });
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError("");
    setSuccess("");
    try {
      await readJson(
        await fetch("/api/integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }),
      );
      setSuccess("Integration configuration saved. Secrets remain environment-managed.");
      setForm({ id: "", provider: "META_WHATSAPP", name: "", enabled: false, endpointUrl: "", accountReference: "", notes: "" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Integration save failed.");
    } finally {
      setBusy("");
    }
  }

  function edit(configuration: Configuration) {
    setForm({
      id: configuration.id,
      provider: configuration.provider,
      name: configuration.name,
      enabled: configuration.enabled,
      endpointUrl: configuration.endpointUrl || "",
      accountReference: configuration.accountReference || "",
      notes: configuration.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function test(id: string) {
    setBusy(`test:${id}`);
    setError("");
    setSuccess("");
    try {
      const result = await readJson<{ dryRun: boolean; externalRequestSent: boolean }>(
        await fetch("/api/integrations/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ integrationId: id }),
        }),
      );
      setSuccess(`Validation completed. Dry run: ${result.dryRun ? "yes" : "no"}; external request sent: ${result.externalRequestSent ? "yes" : "no"}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Integration test failed.");
    } finally {
      setBusy("");
    }
  }

  if (!overview) return <div className="suite-loading">Loading integrations and API controls…</div>;

  return (
    <div className="suite-stack">
      <section className="suite-metrics">
        <article><span>Providers</span><strong>{overview.providers.length}</strong></article>
        <article><span>Configurations</span><strong>{overview.configurations.length}</strong></article>
        <article><span>Secret-ready</span><strong>{overview.providers.filter((provider) => provider.secretsConfigured).length}</strong><small>Values never displayed or stored here</small></article>
        <article><span>External writes</span><strong>{overview.externalWritesGloballyEnabled ? "Enabled" : "Locked"}</strong><small>Production actions remain guarded</small></article>
      </section>

      {error ? <div className="suite-alert error">{error}</div> : null}
      {success ? <div className="suite-alert success">{success}</div> : null}

      <section className="suite-grid two">
        <form className="suite-card" onSubmit={save}>
          <header><div><span>Integration registry</span><h3>{form.id ? "Update configuration" : "Register a provider"}</h3><p>No secret or token is accepted by this form.</p></div></header>
          <div className="suite-form-grid two">
            <label><span>Provider</span><select value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))}>{overview.providers.map((provider) => <option key={provider.provider} value={provider.provider}>{provider.label}</option>)}</select></label>
            <label><span>Configuration name</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
            <label><span>HTTPS endpoint</span><input type="url" value={form.endpointUrl} onChange={(event) => setForm((current) => ({ ...current, endpointUrl: event.target.value }))} placeholder="https://..." /></label>
            <label><span>Account reference</span><input value={form.accountReference} onChange={(event) => setForm((current) => ({ ...current, accountReference: event.target.value }))} /></label>
            <label className="suite-span-two"><span>Notes</span><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            <label className="suite-check"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} /> Enable configuration metadata</label>
          </div>
          <footer>{form.id ? <button type="button" className="secondary" onClick={() => setForm({ id: "", provider: "META_WHATSAPP", name: "", enabled: false, endpointUrl: "", accountReference: "", notes: "" })}>Cancel edit</button> : null}<button disabled={busy === "save"}>{busy === "save" ? "Saving…" : "Save configuration"}</button></footer>
        </form>

        <div className="suite-card">
          <header><div><span>Provider readiness</span><h3>Environment and write-lock status</h3></div></header>
          <div className="integration-provider-list">
            {overview.providers.map((provider) => (
              <article key={provider.provider}>
                <div><strong>{provider.label}</strong><p>{provider.description}</p></div>
                <div className="integration-badges"><span className={provider.secretsConfigured ? "ok" : "warn"}>{provider.secretsConfigured ? "Secrets configured" : "Secrets incomplete"}</span><span className={provider.externalWriteEnabled ? "warn" : "safe"}>{provider.externalWriteEnabled ? "Writes enabled" : "Writes locked"}</span></div>
                <small>{provider.secrets.map((secret) => `${secret.name}: ${secret.configured ? "configured" : "missing"}`).join(" · ") || "No secret required"}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="suite-card">
        <header><div><span>Saved configurations</span><h3>Integration controls and dry-run validation</h3></div></header>
        <div className="suite-list">
          {overview.configurations.map((configuration) => (
            <article key={configuration.id}>
              <div><strong>{configuration.name} · {humanise(configuration.provider)}</strong><small>{configuration.status} · {formatDate(configuration.lastTestedAt)}{configuration.lastTestResult ? ` · ${configuration.lastTestResult}` : ""}</small></div>
              <div className="suite-actions"><button type="button" className="secondary" onClick={() => edit(configuration)}>Edit</button><button type="button" disabled={busy === `test:${configuration.id}`} onClick={() => void test(configuration.id)}>{busy === `test:${configuration.id}` ? "Testing…" : "Dry-run test"}</button></div>
            </article>
          ))}
          {overview.configurations.length === 0 ? <p className="suite-empty">No integration configuration saved yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
