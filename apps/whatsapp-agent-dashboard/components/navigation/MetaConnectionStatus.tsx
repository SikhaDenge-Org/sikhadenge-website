"use client";

import { useEffect, useState } from "react";

type MetaStatus = {
  connected: boolean;
  outboundMode: "disabled" | "dry_run" | "live";
  latestInboundAt: string | null;
  phoneNumberIdConfigured: boolean;
  error?: string;
};

export default function MetaConnectionStatus() {
  const [status, setStatus] = useState<MetaStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/meta/status", { cache: "no-store" });
        if (response.status === 401) {
          window.location.assign("/login");
          return;
        }
        const payload = (await response.json()) as MetaStatus;
        if (!cancelled && response.ok) setStatus(payload);
      } catch {
        if (!cancelled) setStatus(null);
      }
    }

    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const label = !status
    ? "Checking Meta…"
    : status.outboundMode === "live"
      ? "Meta live"
      : status.connected
        ? "Meta connected"
        : "Meta connection pending";

  const title = !status
    ? "Checking WhatsApp Cloud API connection."
    : status.outboundMode === "live"
      ? "Incoming and outgoing WhatsApp Cloud API traffic is enabled."
      : status.connected
        ? "Incoming WhatsApp Cloud API traffic is connected. Open Cutover to review outbound activation."
        : "Meta credentials or inbound webhook evidence are incomplete.";

  return (
    <button
      className={`secondary-button meta-connection-status ${status?.connected ? "connected" : "pending"} ${status?.outboundMode === "live" ? "live" : ""}`}
      type="button"
      title={title}
      aria-live="polite"
      onClick={() => window.location.assign("/cutover")}
    >
      <span aria-hidden="true" />
      {label}
    </button>
  );
}
