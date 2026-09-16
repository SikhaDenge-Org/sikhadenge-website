"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type EmailState = {
  connections?: Array<{ status?: string }>;
};

export default function EmailChannelLink() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch("/api/email/connections", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as EmailState;
        const isLive = payload.connections?.some((item) => item.status === "CONNECTED" || item.status === "VERIFIED") ?? false;
        if (alive) setConnected(isLive);
      } catch {
        if (alive) setConnected(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <Link
      className={`sx-chan ${connected ? "is-active" : "is-pending"}`}
      href="/email"
      aria-label={connected ? "Email connected" : "Connect Email"}
    >
      <span className="sx-chan-ic">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <rect width="24" height="24" rx="7" fill="#EA4335" />
          <rect x="5" y="7" width="14" height="10" rx="2" fill="none" stroke="#fff" strokeWidth="1.7" />
          <path d="m6 8 6 5 6-5" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="sx-chan-name">Email</span>
      {connected ? (
        <span className="sx-chan-dot" aria-label="Connected" title="Connected" />
      ) : (
        <span className="sx-chan-tag">Connect</span>
      )}
    </Link>
  );
}
