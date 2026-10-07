"use client";

import { FormEvent, useEffect, useState } from "react";

import { validateAdminPasswordReset } from "./admin-password-reset";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  _count: { sessions: number; assignedConversations: number; assignedLeads: number };
};

type AdminOverview = {
  users: User[];
  sessions: Array<{
    id: string;
    userId: string;
    expiresAt: string;
    lastSeenAt: string;
    revokedAt: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
    user: { name: string; email: string };
  }>;
  loginAttempts: Array<{ email: string; ipAddress: string | null; succeeded: boolean; createdAt: string }>;
  auditLogs: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    ipAddress: string | null;
    createdAt: string;
    actor: { name: string; email: string } | null;
  }>;
  metrics: {
    users: number;
    activeUsers: number;
    admins: number;
    activeSessions: number;
    failedLogins24h: number;
    distinctFailureIps: number;
  };
  controls: Record<string, boolean>;
};

const roles = ["ADMIN", "MANAGER", "COUNSELOR", "ANALYST", "VIEWER"];

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function humanise(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AdminManager() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "COUNSELOR" });
  const [passwordResetUser, setPasswordResetUser] = useState<User | null>(null);
  const [passwordForm, setPasswordForm] = useState({ password: "", confirmation: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    const response = await fetch("/api/admin/overview", { cache: "no-store" });
    setOverview(await readJson<AdminOverview>(response));
  }

  useEffect(() => {
    void load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Admin module could not load.");
    });
  }, []);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError("");
    setSuccess("");
    try {
      await readJson(
        await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }),
      );
      setForm({ name: "", email: "", password: "", role: "COUNSELOR" });
      setSuccess("Dashboard user created.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "User creation failed.");
    } finally {
      setBusy("");
    }
  }

  async function updateUser(userId: string, payload: Record<string, unknown>) {
    setBusy(`user:${userId}`);
    setError("");
    setSuccess("");
    try {
      await readJson(
        await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setSuccess("User access updated.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "User update failed.");
    } finally {
      setBusy("");
    }
  }

  function openPasswordReset(user: User) {
    setPasswordResetUser(user);
    setPasswordForm({ password: "", confirmation: "" });
    setError("");
    setSuccess("");
  }

  function closePasswordReset() {
    if (busy.startsWith("password:")) return;
    setPasswordResetUser(null);
    setPasswordForm({ password: "", confirmation: "" });
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordResetUser) return;

    const validation = validateAdminPasswordReset(
      passwordForm.password,
      passwordForm.confirmation,
    );
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    const target = passwordResetUser;
    setBusy(`password:${target.id}`);
    setError("");
    setSuccess("");
    try {
      await readJson(
        await fetch(`/api/admin/users/${encodeURIComponent(target.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: passwordForm.password }),
        }),
      );
      setPasswordResetUser(null);
      setPasswordForm({ password: "", confirmation: "" });
      setSuccess(`Password reset for ${target.name}. All active sessions were revoked.`);
      try {
        await load();
      } catch {
        window.location.assign("/login");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Password reset failed.");
    } finally {
      setBusy("");
    }
  }

  async function revoke(userId: string) {
    if (!window.confirm("Revoke all active sessions for this user?")) return;
    setBusy(`revoke:${userId}`);
    setError("");
    try {
      const result = await readJson<{ revokedSessions: number }>(
        await fetch("/api/admin/sessions/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }),
      );
      setSuccess(`${result.revokedSessions} session(s) revoked.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Session revocation failed.");
    } finally {
      setBusy("");
    }
  }

  if (!overview) return <div className="suite-loading">Loading admin and security controls…</div>;

  return (
    <div className="suite-stack">
      <section className="suite-metrics">
        <article><span>Active users</span><strong>{overview.metrics.activeUsers}</strong><small>{overview.metrics.admins} administrators</small></article>
        <article><span>Active sessions</span><strong>{overview.metrics.activeSessions}</strong></article>
        <article><span>Failed logins 24h</span><strong>{overview.metrics.failedLogins24h}</strong><small>{overview.metrics.distinctFailureIps} source IPs</small></article>
        <article><span>Critical outbound</span><strong>{overview.controls.outboundLive ? "Live" : "Locked"}</strong><small>Secrets are never displayed</small></article>
      </section>

      {error ? <div className="suite-alert error">{error}</div> : null}
      {success ? <div className="suite-alert success">{success}</div> : null}

      <section className="suite-grid two">
        <form className="suite-card" onSubmit={createUser}>
          <header><div><span>User administration</span><h3>Create role-protected dashboard access</h3></div></header>
          <div className="suite-form-grid two">
            <label><span>Name</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></label>
            <label><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required /></label>
            <label><span>Initial password</span><input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} minLength={12} required /></label>
            <label><span>Role</span><select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
          </div>
          <footer><small>Minimum 12 characters with uppercase, lowercase and number.</small><button disabled={busy === "create"}>{busy === "create" ? "Creating…" : "Create user"}</button></footer>
        </form>

        <div className="suite-card">
          <header><div><span>Production controls</span><h3>Runtime safety state</h3></div></header>
          <div className="security-control-grid">
            {Object.entries(overview.controls).map(([name, enabled]) => (
              <article key={name}><span>{humanise(name)}</span><strong className={enabled ? "warn" : "safe"}>{enabled ? "Enabled" : "Disabled"}</strong></article>
            ))}
          </div>
        </div>
      </section>

      <section className="suite-card">
        <header><div><span>Users and roles</span><h3>Access, workload and session control</h3></div></header>
        <div className="admin-user-list">
          {overview.users.map((user) => (
            <article key={user.id}>
              <div><strong>{user.name}</strong><small>{user.email} · Last login {formatDate(user.lastLoginAt)}</small></div>
              <div className="admin-user-stats"><span>{user._count.assignedConversations} chats</span><span>{user._count.assignedLeads} leads</span><span>{user._count.sessions} sessions</span></div>
              <select value={user.role} disabled={busy === `user:${user.id}`} onChange={(event) => void updateUser(user.id, { role: event.target.value })}>{roles.map((role) => <option key={role}>{role}</option>)}</select>
              <button type="button" className={user.isActive ? "danger" : "secondary"} disabled={busy === `user:${user.id}`} onClick={() => void updateUser(user.id, { isActive: !user.isActive })}>{user.isActive ? "Deactivate" : "Activate"}</button>
              <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => openPasswordReset(user)}>Reset password</button>
              <button type="button" className="secondary" disabled={busy === `revoke:${user.id}`} onClick={() => void revoke(user.id)}>Revoke sessions</button>
            </article>
          ))}
        </div>
      </section>

      <section className="suite-grid two">
        <div className="suite-card">
          <header><div><span>Active sessions</span><h3>Recent authenticated activity</h3></div></header>
          <div className="suite-list compact">
            {overview.sessions.filter((session) => !session.revokedAt).slice(0, 30).map((session) => (
              <article key={session.id}><div><strong>{session.user.name}</strong><small>{session.ipAddress || "IP unavailable"} · Last seen {formatDate(session.lastSeenAt)}</small></div><span>{formatDate(session.expiresAt)}</span></article>
            ))}
          </div>
        </div>
        <div className="suite-card">
          <header><div><span>Audit trail</span><h3>Latest privileged operations</h3></div></header>
          <div className="suite-list compact">
            {overview.auditLogs.slice(0, 40).map((log) => (
              <article key={log.id}><div><strong>{humanise(log.action)}</strong><small>{log.actor?.name || "System"} · {log.entityType} · {formatDate(log.createdAt)}</small></div></article>
            ))}
          </div>
        </div>
      </section>

      {passwordResetUser ? (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePasswordReset();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1600,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(15, 23, 42, 0.48)",
            backdropFilter: "blur(3px)",
          }}
        >
          <form
            className="suite-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-password-reset-title"
            onSubmit={resetPassword}
            style={{
              width: "min(460px, calc(100vw - 32px))",
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
            }}
          >
            <header>
              <div>
                <span>Credential security</span>
                <h3 id="admin-password-reset-title">Reset password for {passwordResetUser.name}</h3>
              </div>
              <button type="button" className="secondary" onClick={closePasswordReset} disabled={busy.startsWith("password:")}>Close</button>
            </header>
            <div className="suite-form-grid">
              <label>
                <span>New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.password}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                  minLength={12}
                  required
                  autoFocus
                />
              </label>
              <label>
                <span>Confirm new password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirmation}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmation: event.target.value }))}
                  minLength={12}
                  required
                />
              </label>
              <small style={{ color: "#6f7783", lineHeight: 1.55 }}>
                Minimum 12 characters with uppercase, lowercase and number. The existing password is never displayed. A successful reset immediately revokes every active session for this account.
              </small>
            </div>
            <footer>
              <button type="button" className="secondary" onClick={closePasswordReset} disabled={busy.startsWith("password:")}>Cancel</button>
              <button type="submit" disabled={busy === `password:${passwordResetUser.id}`}>
                {busy === `password:${passwordResetUser.id}` ? "Resetting…" : "Reset & revoke sessions"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
