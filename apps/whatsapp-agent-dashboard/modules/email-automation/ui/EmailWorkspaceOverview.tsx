"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import styles from "./EmailWorkspaceOverview.module.css";

type ConnectionState = {
  connections: Array<{
    status: string;
    displayName?: string | null;
    externalAccountId?: string | null;
  }>;
  senders: Array<{
    verificationStatus: string;
    isActive: boolean;
    isWorkspaceDefault: boolean;
    fromEmail: string;
  }>;
};

type PlatformState = {
  inbound: number;
  campaigns: number;
  sequences: number;
  analytics: number;
  messages: Record<string, number>;
  automationEvents: Record<string, number>;
  providerReadiness: Array<{
    provider: string;
    configured: boolean;
    registered: boolean;
  }>;
  guards: {
    runtimeMode: string;
    externalWritesEnabled: boolean;
    inboundSyncEnabled: boolean;
    trackingEnabled?: boolean;
  };
};

function safeNumber(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

export default function EmailWorkspaceOverview() {
  const [connections, setConnections] = useState<ConnectionState | null>(null);
  const [platform, setPlatform] = useState<PlatformState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      fetch("/api/email/connections", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("Connection state could not be loaded.");
        return response.json();
      }),
      fetch("/api/email/platform/overview", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("Email platform state could not be loaded.");
        return response.json();
      }),
    ])
      .then(([connectionData, platformData]) => {
        if (cancelled) return;
        setConnections(connectionData as ConnectionState);
        setPlatform(platformData as PlatformState);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Email workspace state could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const activeConnections =
    connections?.connections.filter(
      (item) => item.status === "CONNECTED" || item.status === "VERIFIED",
    ).length ?? 0;

  const verifiedSenders =
    connections?.senders.filter(
      (item) => item.verificationStatus === "VERIFIED" && item.isActive,
    ).length ?? 0;

  const workspaceDefault =
    connections?.senders.find((item) => item.isWorkspaceDefault)?.fromEmail ?? "Not selected";

  const gmailReady =
    platform?.providerReadiness.some(
      (item) => item.provider === "GOOGLE_GMAIL" && item.configured,
    ) ?? false;

  const sent = safeNumber(platform?.messages.SENT);
  const delivered = safeNumber(platform?.messages.DELIVERED);
  const failed = safeNumber(platform?.messages.FAILED);
  const bounced = safeNumber(platform?.messages.BOUNCED);
  const dryRun = safeNumber(platform?.messages.DRY_RUN);
  const totalMessages = Object.values(platform?.messages ?? {}).reduce(
    (sum, value) => sum + safeNumber(value),
    0,
  );
  const failureTotal = failed + bounced;
  const deliveryDenominator = delivered + failureTotal;
  const deliveryRate = deliveryDenominator > 0 ? percent(delivered, deliveryDenominator) : 0;

  const processedEvents = safeNumber(platform?.automationEvents.PROCESSED);
  const pendingEvents = safeNumber(platform?.automationEvents.PENDING);
  const failedEvents = safeNumber(platform?.automationEvents.FAILED);

  const distribution = useMemo(
    () => [
      { label: "Delivered", value: delivered, tone: "#2c72f3" },
      { label: "Sent", value: sent, tone: "#18b77a" },
      { label: "Dry run", value: dryRun, tone: "#8150e6" },
      { label: "Failed", value: failureTotal, tone: "#e95b66" },
    ],
    [delivered, sent, dryRun, failureTotal],
  );

  const maxDistributionValue = Math.max(1, ...distribution.map((item) => item.value));
  const runtimeMode = platform?.guards.runtimeMode ?? "Loading";
  const externalWritesEnabled = platform?.guards.externalWritesEnabled ?? false;
  const connected = activeConnections > 0;

  return (
    <div className={styles.root}>
      {loadError ? <div className={styles.errorNotice}>{loadError}</div> : null}

      <section className={styles.controlBar} aria-label="Email workspace controls">
        <div className={styles.controlCopy}>
          <span className={styles.controlEyebrow}>Email workspace</span>
          <h2 className={styles.controlTitle}>Operate email at scale</h2>
          <p className={styles.controlDescription}>
            Accounts, templates, transactional sending and automation under guarded runtime controls.
          </p>
        </div>

        <div className={styles.controlActions}>
          <div className={styles.statusRow}>
            <span className={`${styles.statusPill} ${connected ? styles.statusPillConnected : ""}`}>
              <i className={connected ? styles.statusDot : undefined} />
              {connected ? "Connected" : "Setup required"}
            </span>
            <span className={`${styles.statusPill} ${styles.statusPillBlue}`}>{runtimeMode}</span>
            <span className={styles.statusPill}>{gmailReady ? "Google ready" : "Google setup required"}</span>
          </div>
          <div className={styles.buttonRow}>
            <Link className={styles.primaryButton} href="/email/accounts">
              <span aria-hidden="true">G</span>
              {connected ? "Manage Google account" : "Connect Google account"}
            </Link>
            <Link className={styles.secondaryButton} href="/email/accounts">
              Manage workspace
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.metricGrid} aria-label="Email workspace metrics">
        <article className={styles.metricCard}>
          <span className={`${styles.metricIcon} ${styles.blue}`} aria-hidden="true">@</span>
          <div className={styles.metricCopy}>
            <span className={styles.metricLabel}>Connected accounts</span>
            <strong className={styles.metricValue}>{connections ? activeConnections : "—"}</strong>
            <span className={styles.metricHelper}>Google Workspace connections</span>
          </div>
        </article>

        <article className={styles.metricCard}>
          <span className={`${styles.metricIcon} ${styles.green}`} aria-hidden="true">✓</span>
          <div className={styles.metricCopy}>
            <span className={styles.metricLabel}>Verified senders</span>
            <strong className={styles.metricValue}>{connections ? verifiedSenders : "—"}</strong>
            <span className={styles.metricHelper}>Primary addresses + aliases</span>
          </div>
        </article>

        <article className={styles.metricCard}>
          <span className={`${styles.metricIcon} ${styles.violet}`} aria-hidden="true">✉</span>
          <div className={styles.metricCopy}>
            <span className={styles.metricLabel}>Workspace default</span>
            <strong className={`${styles.metricValue} ${styles.metricValueEmail}`}>{workspaceDefault}</strong>
            <span className={styles.metricHelper}>Fallback sender for templates</span>
          </div>
        </article>

        <article className={styles.metricCard}>
          <span className={`${styles.metricIcon} ${styles.orange}`} aria-hidden="true">◎</span>
          <div className={styles.metricCopy}>
            <span className={styles.metricLabel}>External delivery</span>
            <strong className={`${styles.metricValue} ${externalWritesEnabled ? "" : styles.metricValueLocked}`}>
              {externalWritesEnabled ? "ENABLED" : "LOCKED"}
            </strong>
            <span className={styles.metricHelper}>{externalWritesEnabled ? "Provider writes enabled" : `${runtimeMode} safety boundary`}</span>
          </div>
        </article>
      </section>

      <div className={styles.sectionHeading}>
        <h2>Quick navigation</h2>
        <span>Everything you need to operate email at scale.</span>
      </div>

      <section className={styles.quickGrid} aria-label="Email workspace navigation">
        <Link className={`${styles.quickCard} ${styles.quickBlue}`} href="/email/accounts">
          <span className={styles.quickIcon} aria-hidden="true">@</span>
          <span className={styles.quickCopy}>
            <strong>Accounts</strong>
            <span>Connect Google Workspace accounts, aliases and sender settings.</span>
          </span>
          <span className={styles.quickArrow} aria-hidden="true">›</span>
        </Link>

        <Link className={`${styles.quickCard} ${styles.quickGreen}`} href="/email/templates">
          <span className={styles.quickIcon} aria-hidden="true">▤</span>
          <span className={styles.quickCopy}>
            <strong>Templates</strong>
            <span>Create reusable email templates with variables and approved content.</span>
          </span>
          <span className={styles.quickArrow} aria-hidden="true">›</span>
        </Link>

        <Link className={`${styles.quickCard} ${styles.quickViolet}`} href="/email/send">
          <span className={styles.quickIcon} aria-hidden="true">↗</span>
          <span className={styles.quickCopy}>
            <strong>Send Email</strong>
            <span>Run controlled transactional sends with personalization and audit protection.</span>
          </span>
          <span className={styles.quickArrow} aria-hidden="true">›</span>
        </Link>

        <Link className={`${styles.quickCard} ${styles.quickOrange}`} href="/email/automation">
          <span className={styles.quickIcon} aria-hidden="true">⚡</span>
          <span className={styles.quickCopy}>
            <strong>Automation</strong>
            <span>Monitor queue health, runtime mode and automated email workflows.</span>
          </span>
          <span className={styles.quickArrow} aria-hidden="true">›</span>
        </Link>
      </section>

      <section className={styles.primaryGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3>Email performance <span>(current workspace)</span></h3>
            <span className={styles.statusPill}>{totalMessages.toLocaleString()} total messages</span>
          </div>

          <div className={styles.performanceStats}>
            <div className={styles.performanceStat}><i className={styles.dotBlue} /><strong>{sent.toLocaleString()}</strong><span>Sent</span></div>
            <div className={styles.performanceStat}><i className={styles.dotGreen} /><strong>{delivered.toLocaleString()}</strong><span>Delivered</span></div>
            <div className={styles.performanceStat}><i className={styles.dotViolet} /><strong>{deliveryRate}%</strong><span>Delivery rate</span></div>
            <div className={styles.performanceStat}><i className={styles.dotOrange} /><strong>{dryRun.toLocaleString()}</strong><span>Dry run</span></div>
            <div className={styles.performanceStat}><i className={styles.dotRed} /><strong>{failureTotal.toLocaleString()}</strong><span>Failed / bounced</span></div>
          </div>

          <div className={styles.distribution} aria-label="Message status distribution">
            {distribution.map((item) => (
              <div className={styles.distributionRow} key={item.label}>
                <span>{item.label}</span>
                <i className={styles.distributionTrack}>
                  <b
                    className={styles.distributionFill}
                    style={{
                      width: `${Math.max(2, percent(item.value, maxDistributionValue))}%`,
                      background: item.tone,
                    }}
                  />
                </i>
                <strong>{item.value.toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3>System status</h3>
            <span className={styles.panelHeaderBadge}><i />Live</span>
          </div>

          <div className={styles.systemRow}>
            <span className={`${styles.systemIcon} ${styles.green}`} aria-hidden="true">G</span>
            <span className={styles.systemCopy}>
              <strong>Google Workspace</strong>
              <span>{connected ? workspaceDefault : "No account connected"}</span>
            </span>
            <span className={`${styles.systemStatus} ${connected ? "" : styles.systemStatusWarn}`}><i />{connected ? "Connected" : "Setup"}</span>
          </div>

          <div className={styles.systemRow}>
            <span className={`${styles.systemIcon} ${styles.blue}`} aria-hidden="true">API</span>
            <span className={styles.systemCopy}>
              <strong>Gmail OAuth</strong>
              <span>Server-side protected credentials</span>
            </span>
            <span className={`${styles.systemStatus} ${gmailReady ? "" : styles.systemStatusWarn}`}><i />{gmailReady ? "Ready" : "Pending"}</span>
          </div>

          <div className={styles.systemRow}>
            <span className={`${styles.systemIcon} ${styles.violet}`} aria-hidden="true">⚡</span>
            <span className={styles.systemCopy}>
              <strong>Automation runtime</strong>
              <span>{processedEvents.toLocaleString()} processed · {pendingEvents.toLocaleString()} pending</span>
            </span>
            <span className={`${styles.systemStatus} ${failedEvents > 0 ? styles.systemStatusWarn : ""}`}><i />{runtimeMode}</span>
          </div>

          <div className={styles.systemRow}>
            <span className={`${styles.systemIcon} ${styles.orange}`} aria-hidden="true">↻</span>
            <span className={styles.systemCopy}>
              <strong>Inbound sync</strong>
              <span>{platform?.inbound.toLocaleString() ?? "—"} inbound messages stored</span>
            </span>
            <span className={`${styles.systemStatus} ${platform?.guards.inboundSyncEnabled ? "" : styles.systemStatusWarn}`}><i />{platform?.guards.inboundSyncEnabled ? "Enabled" : "Off"}</span>
          </div>
        </article>
      </section>

      <section className={styles.secondaryGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3>Workspace activity</h3>
            <span className={styles.statusPill}>Real workspace data</span>
          </div>
          <div className={styles.activityList}>
            <div className={styles.activityRow}>
              <span className={`${styles.activityIcon} ${styles.blue}`} aria-hidden="true">C</span>
              <span className={styles.activityCopy}><strong>Campaigns</strong><span>Email campaign records in this workspace</span></span>
              <strong className={styles.activityValue}>{platform?.campaigns.toLocaleString() ?? "—"}</strong>
            </div>
            <div className={styles.activityRow}>
              <span className={`${styles.activityIcon} ${styles.violet}`} aria-hidden="true">S</span>
              <span className={styles.activityCopy}><strong>Sequences</strong><span>Automation sequence definitions</span></span>
              <strong className={styles.activityValue}>{platform?.sequences.toLocaleString() ?? "—"}</strong>
            </div>
            <div className={styles.activityRow}>
              <span className={`${styles.activityIcon} ${styles.green}`} aria-hidden="true">↙</span>
              <span className={styles.activityCopy}><strong>Inbound email</strong><span>Synced inbound messages</span></span>
              <strong className={styles.activityValue}>{platform?.inbound.toLocaleString() ?? "—"}</strong>
            </div>
            <div className={styles.activityRow}>
              <span className={`${styles.activityIcon} ${styles.orange}`} aria-hidden="true">A</span>
              <span className={styles.activityCopy}><strong>Analytics events</strong><span>Tracked email lifecycle events</span></span>
              <strong className={styles.activityValue}>{platform?.analytics.toLocaleString() ?? "—"}</strong>
            </div>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3>Email health</h3>
            <Link className={styles.statusPill} href="/email/automation">View runtime</Link>
          </div>

          <div className={styles.healthBody}>
            <div className={styles.donutWrap}>
              <div
                className={styles.donut}
                style={{ background: `conic-gradient(#2878f5 0 ${deliveryRate}%, #e8eef7 ${deliveryRate}% 100%)` }}
              >
                <span className={styles.donutCopy}>
                  <strong>{deliveryRate}%</strong>
                  <span>Delivery rate</span>
                </span>
              </div>
            </div>

            <div className={styles.healthBars}>
              <div className={styles.healthRow}>
                <span>Delivered</span>
                <i className={styles.healthTrack}><b style={{ width: `${percent(delivered, maxDistributionValue)}%`, background: "#2878f5" }} /></i>
                <strong>{delivered.toLocaleString()}</strong>
              </div>
              <div className={styles.healthRow}>
                <span>Sent</span>
                <i className={styles.healthTrack}><b style={{ width: `${percent(sent, maxDistributionValue)}%`, background: "#26c18b" }} /></i>
                <strong>{sent.toLocaleString()}</strong>
              </div>
              <div className={styles.healthRow}>
                <span>Failed</span>
                <i className={styles.healthTrack}><b style={{ width: `${percent(failureTotal, maxDistributionValue)}%`, background: "#f2636c" }} /></i>
                <strong>{failureTotal.toLocaleString()}</strong>
              </div>
              <div className={styles.healthRow}>
                <span>Automation</span>
                <i className={styles.healthTrack}><b style={{ width: `${percent(processedEvents, Math.max(1, processedEvents + pendingEvents + failedEvents))}%`, background: "#8249e7" }} /></i>
                <strong>{processedEvents.toLocaleString()}</strong>
              </div>
            </div>
          </div>

          <div className={styles.goodStanding}>
            <span className={`${styles.activityIcon} ${failureTotal > 0 ? styles.orange : styles.green}`} aria-hidden="true">✓</span>
            <span>
              <strong>{failureTotal > 0 ? "Monitor delivery" : "Good standing"}</strong>
              <span>{failureTotal > 0 ? `${failureTotal} failed or bounced messages need attention.` : "No failed or bounced messages are currently recorded."}</span>
            </span>
          </div>
        </article>
      </section>
    </div>
  );
}
