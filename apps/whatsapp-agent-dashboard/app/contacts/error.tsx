"use client";

import { useEffect } from "react";

export default function ContactsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Contacts route error", error);
  }, [error]);

  return (
    <main
      role="alert"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f8fafc",
        color: "#0f172a",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <section
        style={{
          width: "min(560px, 100%)",
          padding: 28,
          border: "1px solid #e2e8f0",
          borderRadius: 20,
          background: "#fff",
          boxShadow: "0 20px 54px rgba(15,23,42,.08)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#2563eb" }}>
          Contacts workspace
        </div>
        <h1 style={{ margin: "8px 0", fontSize: 24, letterSpacing: "-.025em" }}>The contacts view could not finish loading.</h1>
        <p style={{ margin: "0 0 18px", color: "#64748b", lineHeight: 1.6 }}>
          Your CRM data has not been changed. Retry the workspace; if the underlying service is temporarily unavailable this page will recover without exposing a blank screen.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: 40,
            padding: "0 16px",
            border: "1px solid #1d4ed8",
            borderRadius: 10,
            background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
            color: "#fff",
            fontWeight: 750,
            cursor: "pointer",
          }}
        >
          Retry contacts
        </button>
      </section>
    </main>
  );
}
