import { redirect } from "next/navigation";

import LoginForm from "../../components/auth/LoginForm";
import { getCurrentDashboardUser } from "../../lib/auth/session";
import "../login-page01-code.css";
import "../login-page01-left-image.css";

export const dynamic = "force-dynamic";

const BRAND_LOGO = "/sikhadenge-header-safe-320.png";

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 19 6v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" />
      <path d="m9.2 12.2 1.8 1.8 3.8-4" />
    </svg>
  );
}

export default async function LoginPage() {
  const user = await getCurrentDashboardUser();
  if (user) redirect("/inbox");

  return (
    <main
      className="split01"
      data-page="login-page01-split-v1"
      data-rendering="left-hq-image-v9"
      data-page01-hero="approved-hq-v9"
    >
      <section className="split01__hero split01__hero--approved-image" aria-label="SikhaDenge WhatsApp AI Agent workspace">
        <img
          className="split01__hero-approved-image"
          src="/page01-left-hq-v9.png?v=9"
          alt=""
          aria-hidden="true"
        />
      </section>

      <section className="split01__signin" aria-labelledby="login-title">
        <div className="split01__orb split01__orb--top" aria-hidden="true" />
        <div className="split01__orb split01__orb--bottom" aria-hidden="true" />
        <div className="split01__right-dots" aria-hidden="true" />

        <div className="split01__signin-inner">
          <div className="split01__signin-brand">
            <img src={BRAND_LOGO} alt="SikhaDenge" width={320} height={80} />
            <strong>EngageOS</strong>
          </div>

          <div className="split01__signin-heading">
            <p>SECURE TEAM ACCESS</p>
            <h2 id="login-title">Welcome back</h2>
            <span>Sign in to manage conversations, qualified leads,<br className="split01__desktop-break" /> agent knowledge and counselor handoffs.</span>
          </div>

          <div className="split01__form-card">
            <LoginForm />
            <p className="split01__access-note">
              <ShieldIcon />
              Access is restricted to authorized SikhaDenge team members.
            </p>
          </div>
        </div>

        <div className="split01__tagline"><i /> Better Conversations. Brighter Futures.</div>
      </section>
    </main>
  );
}
