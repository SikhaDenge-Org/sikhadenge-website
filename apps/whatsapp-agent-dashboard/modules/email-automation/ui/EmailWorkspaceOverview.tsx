"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ConnectionState = { connections: Array<{ status: string }>; senders: Array<{ verificationStatus: string; isActive: boolean; isWorkspaceDefault: boolean; fromEmail: string }> };
type PlatformState = { guards: { runtimeMode: string; externalWritesEnabled: boolean; inboundSyncEnabled: boolean }; messages: Record<string, number>; automationEvents: Record<string, number> };

export default function EmailWorkspaceOverview() {
  const [connections, setConnections] = useState<ConnectionState | null>(null);
  const [platform, setPlatform] = useState<PlatformState | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch("/api/email/connections", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/email/platform/overview", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([connectionData, platformData]) => {
      setConnections(connectionData as ConnectionState);
      setPlatform(platformData as PlatformState);
    });
  }, []);

  const activeConnections = connections?.connections.filter((item) => item.status === "CONNECTED" || item.status === "VERIFIED").length ?? 0;
  const verifiedSenders = connections?.senders.filter((item) => item.verificationStatus === "VERIFIED" && item.isActive).length ?? 0;
  const workspaceDefault = connections?.senders.find((item) => item.isWorkspaceDefault)?.fromEmail ?? "Not selected";
  const cards = [
    ["Connected accounts", String(activeConnections), activeConnections > 0 ? "LIVE" : "Setup required"],
    ["Verified senders", String(verifiedSenders), workspaceDefault],
    ["Runtime", platform?.guards.runtimeMode ?? "Loading", platform?.guards.externalWritesEnabled ? "External writes enabled" : "External writes locked"],
    ["Delivery health", String(platform?.messages.SENT ?? 0), `${platform?.messages.FAILED ?? 0} failed`],
  ];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={{ padding: 24, borderRadius: 22, background: "linear-gradient(135deg,#101a33,#1c2851)", color: "white", boxShadow: "0 18px 50px rgba(16,26,51,.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: "#6ee7f9" }}>EMAIL OPERATIONS</span>
            <h2 style={{ margin: "8px 0 6px", fontSize: 28 }}>Email Command Center</h2>
            <p style={{ margin: 0, maxWidth: 720, color: "#cbd5e1", lineHeight: 1.6 }}>Run accounts, templates, transactional delivery and automation from dedicated workspaces instead of one oversized screen.</p>
          </div>
          <span style={{ padding: "8px 12px", borderRadius: 999, background: activeConnections > 0 ? "rgba(16,185,129,.16)" : "rgba(245,158,11,.16)", color: activeConnections > 0 ? "#6ee7b7" : "#fcd34d", fontWeight: 800 }}>
            {activeConnections > 0 ? "● Email live" : "○ Email not connected"}
          </span>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
        {cards.map(([label, value, helper]) => (
          <article key={label} style={{ padding: 20, border: "1px solid #e3e8f2", borderRadius: 18, background: "#fff", boxShadow: "0 10px 28px rgba(15,23,42,.05)" }}>
            <small style={{ color: "#718096", fontWeight: 700 }}>{label}</small>
            <strong style={{ display: "block", marginTop: 8, fontSize: 24, color: "#111827" }}>{value}</strong>
            <span style={{ display: "block", marginTop: 6, color: "#94a3b8", fontSize: 12 }}>{helper}</span>
          </article>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        {[
          ["Accounts & Senders", "/email/accounts", "Connect Google Workspace, refresh aliases and choose the workspace default."],
          ["Template Studio", "/email/templates", "Create, approve and preview reusable branded email templates."],
          ["Transactional Send", "/email/send", "Run guarded dry-run or internal-recipient manual sends."],
          ["Automation Runtime", "/email/automation", "Inspect queue state, process pending work and review runtime health."],
        ].map(([title, href, copy]) => (
          <Link key={href} href={href} style={{ padding: 20, borderRadius: 18, border: "1px solid #dfe5f1", textDecoration: "none", background: "linear-gradient(180deg,#fff,#f8faff)", color: "#172033" }}>
            <strong>{title}</strong>
            <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.5, fontSize: 13 }}>{copy}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
