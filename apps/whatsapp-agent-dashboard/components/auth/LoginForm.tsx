"use client";

import { FormEvent, KeyboardEvent, useState } from "react";

const RESET_CONFIRMATION =
  "If this email belongs to an active SikhaDenge account, a secure reset request has been recorded. Contact your workspace administrator to complete the password reset.";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as { error?: string; redirectTo?: string };

      if (!response.ok) {
        setError(result.error ?? "Unable to sign in.");
        return;
      }

      window.location.assign(result.redirectTo ?? "/inbox");
    } catch {
      setError("Unable to reach the dashboard server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetError("");
    setResetMessage("");
    setResetSubmitting(true);

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        setResetError("Unable to record the reset request right now. Please try again shortly.");
        return;
      }

      setResetMessage(result.message ?? RESET_CONFIRMATION);
    } catch {
      setResetError("Unable to reach the dashboard server. Please try again shortly.");
    } finally {
      setResetSubmitting(false);
    }
  }

  function syncCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  function openReset() {
    setError("");
    setPassword("");
    setCapsLock(false);
    setResetError("");
    setResetMessage("");
    setMode("reset");
  }

  function returnToLogin() {
    setResetError("");
    setResetMessage("");
    setMode("login");
  }

  const hasError = Boolean(error);

  if (mode === "reset") {
    return (
      <form className="split01-form split01-form__reset-panel" onSubmit={onResetSubmit}>
        <div className="split01-form__reset-head">
          <span className="split01-form__reset-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M7.5 10V8a4.5 4.5 0 0 1 9 0v2" />
              <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
              <path d="M12 14v2.5" />
            </svg>
          </span>
          <span>
            <h3>Request password reset</h3>
            <p>Enter your team email. We never reveal whether an account exists.</p>
          </span>
        </div>

        <div className="split01-form__field">
          <label htmlFor="reset-email">Email address</label>
          <div className="split01-form__control">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
              <path d="m5 7 7 5 7-5" />
            </svg>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="you@sikhadenge.in"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
        </div>

        <button className="split01-form__reset-submit" type="submit" disabled={resetSubmitting}>
          {resetSubmitting ? (
            <>
              <span className="split01-form__spinner" aria-hidden="true" />
              Recording request…
            </>
          ) : (
            <>Request secure reset <span aria-hidden="true">→</span></>
          )}
        </button>

        {resetMessage ? (
          <p className="split01-form__reset-message" role="status">
            {resetMessage}
          </p>
        ) : null}

        {resetError ? (
          <p className="split01-form__reset-error" role="alert">
            {resetError}
          </p>
        ) : null}

        <button className="split01-form__back" type="button" onClick={returnToLogin}>
          ← Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form className="split01-form" onSubmit={onSubmit}>
      <div className="split01-form__field">
        <label htmlFor="login-email">Email address</label>
        <div className="split01-form__control">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
            <path d="m5 7 7 5 7-5" />
          </svg>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="you@sikhadenge.in"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-label="Work email"
            aria-invalid={hasError}
            required
          />
        </div>
      </div>

      <div className="split01-form__field">
        <div className="split01-form__label-row">
          <label htmlFor="login-password">Password</label>
          <button className="split01-form__forgot" type="button" onClick={openReset}>
            Forgot password?
          </button>
        </div>
        <div className="split01-form__control">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
          </svg>
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={syncCapsLock}
            onKeyUp={syncCapsLock}
            onBlur={() => setCapsLock(false)}
            aria-invalid={hasError}
            aria-describedby={hasError ? "login-error" : capsLock ? "caps-lock-warning" : undefined}
            required
          />
          <button
            type="button"
            className="split01-form__eye"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2.75 12s3.3-5 9.25-5 9.25 5 9.25 5-3.3 5-9.25 5-9.25-5-9.25-5Z" />
              <circle cx="12" cy="12" r="2.35" />
              {showPassword ? null : <path d="M4 4l16 16" />}
            </svg>
          </button>
        </div>
        {capsLock ? (
          <p className="split01-form__caps" id="caps-lock-warning" role="status">
            Caps Lock is on
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="split01-form__error" id="login-error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="split01-form__submit" type="submit" disabled={submitting}>
        {submitting ? (
          <>
            <span className="split01-form__spinner" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          <>
            Sign in <span aria-hidden="true">→</span>
          </>
        )}
      </button>

      <p className="split01-form__meta">
        <i aria-hidden="true" /> Protected sign-in • Rate-limited access
      </p>
    </form>
  );
}
