"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./email-sender-manager.module.css";

type Connection = {
  id: string;
  workspaceId: string;
  provider: string;
  displayName: string;
  externalAccountId: string | null;
  status: string;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  revokedAt: string | null;
};

type Sender = {
  id: string;
  workspaceId: string;
  connectionId: string;
  provider: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string | null;
  verificationStatus: string;
  isProviderDefault: boolean;
  isWorkspaceDefault: boolean;
  isActive: boolean;
  dailyLimit: number | null;
};

type EmailState = {
  workspace: { id: string; slug: string };
  connections: Connection[];
  senders: Sender[];
};

type ActionState = {
  key: string;
  message: string;
  kind: "working" | "success" | "error";
} | null;

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : `Request failed (${response.status}).`,
    );
  }
  return payload as T;
}

function providerLabel(provider: string): string {
  switch (provider) {
    case "GOOGLE_GMAIL":
      return "Google Workspace / Gmail";
    case "MICROSOFT_365":
      return "Microsoft 365";
    default:
      return provider.replaceAll("_", " ");
  }
}

function statusClass(status: string): string {
  if (status === "CONNECTED" || status === "VERIFIED") return styles.good;
  if (status === "PENDING") return styles.warn;
  return styles.bad;
}

function compactDate(value: string | null): string {
  if (!value) return "Not verified yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not verified yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function EmailSenderManager() {
  const [state, setState] = useState<EmailState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const next = await apiJson<EmailState>("/api/email/connections");
      setState(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Email state could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeConnections = useMemo(
    () => state?.connections.filter((connection) => connection.status !== "REVOKED") ?? [],
    [state],
  );
  const verifiedSenders = useMemo(
    () => state?.senders.filter((sender) => sender.verificationStatus === "VERIFIED" && sender.isActive) ?? [],
    [state],
  );
  const workspaceDefault = useMemo(
    () => verifiedSenders.find((sender) => sender.isWorkspaceDefault) ?? null,
    [verifiedSenders],
  );

  async function connectGoogle() {
    try {
      setAction({ key: "connect", message: "Preparing secure Google connection…", kind: "working" });
      const result = await apiJson<{ authorizationUrl: string }>(
        "/api/email/google/connect",
        { method: "POST" },
      );
      window.location.assign(result.authorizationUrl);
    } catch (caught) {
      setAction({
        key: "connect",
        message: caught instanceof Error ? caught.message : "Google connection could not start.",
        kind: "error",
      });
    }
  }

  async function refreshConnection(connectionId: string) {
    try {
      setAction({ key: `refresh:${connectionId}`, message: "Refreshing sender identities…", kind: "working" });
      await apiJson(`/api/email/connections/${encodeURIComponent(connectionId)}/refresh`, {
        method: "POST",
      });
      await load();
      setAction({ key: `refresh:${connectionId}`, message: "Sender identities refreshed.", kind: "success" });
    } catch (caught) {
      setAction({
        key: `refresh:${connectionId}`,
        message: caught instanceof Error ? caught.message : "Sender refresh failed.",
        kind: "error",
      });
    }
  }

  async function chooseDefault(senderIdentityId: string) {
    try {
      setAction({ key: `default:${senderIdentityId}`, message: "Updating workspace default…", kind: "working" });
      await apiJson("/api/email/senders/default", {
        method: "POST",
        body: JSON.stringify({ senderIdentityId }),
      });
      await load();
      setAction({ key: `default:${senderIdentityId}`, message: "Workspace default sender updated.", kind: "success" });
    } catch (caught) {
      setAction({
        key: `default:${senderIdentityId}`,
        message: caught instanceof Error ? caught.message : "Default sender update failed.",
        kind: "error",
      });
    }
  }

  async function disconnect(connection: Connection) {
    if (!window.confirm(`Disconnect ${connection.displayName}? Automated email remains disabled, and stored OAuth credentials will be revoked.`)) {
      return;
    }
    try {
      setAction({ key: `revoke:${connection.id}`, message: "Revoking Google access…", kind: "working" });
      await apiJson(`/api/email/connections/${encodeURIComponent(connection.id)}`, {
        method: "DELETE",
      });
      await load();
      setAction({ key: `revoke:${connection.id}`, message: "Email account disconnected.", kind: "success" });
    } catch (caught) {
      setAction({
        key: `revoke:${connection.id}`,
        message: caught instanceof Error ? caught.message : "Email account could not be disconnected.",
        kind: "error",
      });
    }
  }

  if (loading) {
    return <div className={styles.loading}>Loading Email Automation control plane…</div>;
  }

  return (
    <section className={styles.root} aria-label="Email Automation Control Center">
      <div className={styles.hero}>
        <div>
          <span className={styles.kicker}>EMAIL AUTOMATION · E1</span>
          <h2>Sender Control Center</h2>
          <p>
            Connect multiple Google Workspace accounts, discover verified send-as aliases,
            and choose exactly one workspace default. Production email delivery remains locked.
          </p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void connectGoogle()}>
          <span className={styles.googleMark}>G</span>
          Connect Google account
        </button>
      </div>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      {action ? (
        <div className={`${styles.actionBanner} ${styles[action.kind]}`}>{action.message}</div>
      ) : null}

      <div className={styles.metrics}>
        <article>
          <span>Connected accounts</span>
          <strong>{activeConnections.length}</strong>
          <small>Multiple accounts supported</small>
        </article>
        <article>
          <span>Verified senders</span>
          <strong>{verifiedSenders.length}</strong>
          <small>Primary addresses + aliases</small>
        </article>
        <article>
          <span>Workspace default</span>
          <strong className={styles.metricEmail}>{workspaceDefault?.fromEmail ?? "Not selected"}</strong>
          <small>Fallback sender for templates and flows</small>
        </article>
        <article>
          <span>External delivery</span>
          <strong className={styles.locked}>LOCKED</strong>
          <small>E3 controlled enablement required</small>
        </article>
      </div>

      <div className={styles.sectionHeader}>
        <div>
          <span>CONNECTED ACCOUNTS</span>
          <h3>Google Workspace connections</h3>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={() => void load()}>
          Reload state
        </button>
      </div>

      {activeConnections.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>@</div>
          <h3>No email account connected</h3>
          <p>
            Connect the first Google Workspace account. OAuth tokens stay server-side and are
            encrypted before persistence.
          </p>
          <button className={styles.primaryButton} type="button" onClick={() => void connectGoogle()}>
            Connect first account
          </button>
        </div>
      ) : (
        <div className={styles.connectionGrid}>
          {activeConnections.map((connection) => {
            const accountSenders = state?.senders.filter(
              (sender) => sender.connectionId === connection.id,
            ) ?? [];
            return (
              <article className={styles.connectionCard} key={connection.id}>
                <div className={styles.connectionTop}>
                  <div className={styles.providerIcon}>G</div>
                  <div className={styles.connectionIdentity}>
                    <span>{providerLabel(connection.provider)}</span>
                    <strong>{connection.displayName}</strong>
                    <small>{accountSenders.length} sender identities discovered</small>
                  </div>
                  <span className={`${styles.status} ${statusClass(connection.status)}`}>
                    {connection.status}
                  </span>
                </div>

                <div className={styles.connectionMeta}>
                  <span>Last verified</span>
                  <strong>{compactDate(connection.lastVerifiedAt)}</strong>
                </div>

                <div className={styles.senderList}>
                  {accountSenders.length === 0 ? (
                    <div className={styles.noSenders}>No send-as identity discovered yet.</div>
                  ) : (
                    accountSenders.map((sender) => (
                      <div
                        className={`${styles.senderRow} ${sender.isWorkspaceDefault ? styles.senderDefault : ""}`}
                        key={sender.id}
                      >
                        <div className={styles.senderAvatar}>
                          {(sender.fromName || sender.fromEmail).slice(0, 1).toUpperCase()}
                        </div>
                        <div className={styles.senderIdentity}>
                          <strong>{sender.fromName}</strong>
                          <span>{sender.fromEmail}</span>
                          <div className={styles.senderTags}>
                            <em className={statusClass(sender.verificationStatus)}>
                              {sender.verificationStatus}
                            </em>
                            {sender.isProviderDefault ? <em>Google default</em> : null}
                            {sender.isWorkspaceDefault ? <em className={styles.defaultTag}>Workspace default</em> : null}
                          </div>
                        </div>
                        {!sender.isWorkspaceDefault && sender.verificationStatus === "VERIFIED" && sender.isActive ? (
                          <button
                            className={styles.inlineButton}
                            type="button"
                            onClick={() => void chooseDefault(sender.id)}
                            disabled={action?.kind === "working"}
                          >
                            Make default
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>

                <div className={styles.cardActions}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => void refreshConnection(connection.id)}
                    disabled={action?.kind === "working"}
                  >
                    Refresh aliases
                  </button>
                  <button
                    className={styles.dangerButton}
                    type="button"
                    onClick={() => void disconnect(connection)}
                    disabled={action?.kind === "working"}
                  >
                    Disconnect
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className={styles.guardrail}>
        <div className={styles.guardIcon}>✓</div>
        <div>
          <strong>Production-safe E1 boundary</strong>
          <p>
            Connect, verify, refresh and switch senders now. Actual Gmail message delivery is
            hard-disabled in the provider adapter until the E3 manual-send gate is implemented
            and explicitly enabled.
          </p>
        </div>
      </div>
    </section>
  );
}
