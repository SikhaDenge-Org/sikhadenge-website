"use client";

import { useState } from "react";

export default function LogoutButton() {
  const [submitting, setSubmitting] = useState(false);

  async function logout() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const result = (await response.json()) as { redirectTo?: string };
      window.location.assign(result.redirectTo ?? "/login");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button className="logout-button" type="button" onClick={logout} disabled={submitting}>
      {submitting ? "Signing out..." : "Sign out"}
    </button>
  );
}
