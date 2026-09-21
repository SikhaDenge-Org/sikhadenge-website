import { redirect } from "next/navigation";

import LoginForm from "../../components/auth/LoginForm";
import { getCurrentDashboardUser } from "../../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentDashboardUser();
  if (user) redirect("/inbox");

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">S</div>
        <p className="eyebrow">SikhaDenge owned system</p>
        <h1>WhatsApp AI Agent</h1>
        <p className="login-copy">
          Sign in to manage conversations, qualified leads, agent knowledge and counselor handoffs.
        </p>
        <LoginForm />
        <p className="login-footnote">
          Access is restricted to authorized SikhaDenge team members.
        </p>
      </section>
    </main>
  );
}
