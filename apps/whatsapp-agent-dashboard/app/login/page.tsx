import { redirect } from "next/navigation";

import LoginForm from "../../components/auth/LoginForm";
import { getCurrentDashboardUser } from "../../lib/auth/session";
import "../login-page01-code.css";
import "../login-page01-left-image.css";
import "../login-page01-auth-v12.css";
import "../login-page01-brand-v13.css";

export const dynamic = "force-dynamic";

const BRAND_LOGO = "/sikhadenge-header-safe-320.png";
const PAGE01_HERO_V11 = "/page01-left-hq-v11.png?v=11";

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
      data-rendering="left-hq-image-v11"
      data-page01-hero="approved-hq-v11"
    >
      <section className="split01__hero split01__hero--approved-image" aria-label="SikhaDenge WhatsApp AI Agent workspace">
        
        <div
          className="page01-hero-v17-shell"
          data-page01-hero-version="20260913-211322"
        >
          <picture className="page01-hero-v17-picture">
            <source
              media="(min-width: 1920px)"
              srcSet={"/page01-hero-ultrawide-v17.png?v=20260913-211322"}
            />
            <source
              media="(min-width: 1181px)"
              srcSet={"/page01-hero-desktop-v17.png?v=20260913-211322"}
            />
            <source
              media="(min-width: 621px)"
              srcSet={"/page01-hero-tablet-v17.png?v=20260913-211322"}
            />
            <img
              src={"/page01-hero-desktop-v17.png?v=20260913-211322"}
              alt="SikhaDenge WhatsApp AI Agent Workspace"
              className="split01__hero-approved-image page01-hero-v17-image"
              loading="eager"
              decoding="async"
            />
          </picture>
        </div>
      </section>

      <section className="split01__signin" data-auth-ui="right-auth-v12" aria-labelledby="login-title">
        <div className="split01__orb split01__orb--top" aria-hidden="true" />
        <div className="split01__orb split01__orb--bottom" aria-hidden="true" />
        <div className="split01__right-dots" aria-hidden="true" />

        <div className="split01__signin-inner">
          <div className="split01__signin-brand split01__signin-brand--v13" data-brand-lockup="v13">
            <div className="split01__brand-lockup">
              <img
                className="split01__brand-logo"
                src={BRAND_LOGO}
                alt="SikhaDenge"
                width={320}
                height={80}
              />
              <span className="split01__brand-divider" aria-hidden="true" />
              <span className="split01__product-id">
                <span className="split01__product-name">EngageOS</span>
                <span className="split01__product-kicker">AI ENGAGEMENT</span>
              </span>
            </div>
          </div>

          <div className="split01__signin-heading">
            <p>Secure Team Access</p>
            <h2 id="login-title">Welcome back</h2>
            <span>Sign in to manage conversations, qualified leads,<br className="split01__desktop-break" /> agent knowledge and counselor handoffs.</span>
          </div>

          <div className="split01__form-card" data-auth-card="v12">
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
