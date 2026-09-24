import { DashboardRole } from "@prisma/client";

import AdminManager from "../../components/admin/AdminManager";
import DashboardModuleShell from "../../components/navigation/DashboardModuleShell";
import {
  getCanaryAuthorizationContext,
  INTERNAL_CANARY_CONFIRMATION,
} from "../../lib/admin/canary-authorization-context";
import { requireDashboardUser } from "../../lib/auth/session";
import "../dashboard-system.css";
import "./admin-enterprise-polish.css";

export const dynamic = "force-dynamic";

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

export default async function AdminPage() {
  const user = await requireDashboardUser([DashboardRole.ADMIN]);
  const canary = await getCanaryAuthorizationContext(user);

  return (
    <DashboardModuleShell
      activeTitle="Admin"
      eyebrow="Security and governance"
      title="Admin & Security"
      description="Manage role-protected access, revoke sessions, review login risk, inspect audit history and verify production safety controls."
      userName={user.name}
      userRole={user.role}
    >
      <div className="admin-enterprise-root">
        <div className="suite-stack">
          <section className="suite-card" aria-labelledby="canary-authorization-context-title">
            <header>
              <div>
                <span>WhatsApp internal canary</span>
                <h3 id="canary-authorization-context-title">Canary Authorization Context</h3>
              </div>
              <strong className={canary.canAuthorizeInternalCanary ? "safe" : "warn"}>
                {canary.canAuthorizeInternalCanary ? "Authorization-ready" : "Not authorization-ready"}
              </strong>
            </header>
            <div className="security-control-grid">
              <article><span>ADMIN_USER_ID</span><strong>{canary.userId}</strong></article>
              <article><span>Dashboard role</span><strong>{canary.dashboardRole}</strong></article>
              <article><span>Workspace</span><strong>{canary.workspaceId}</strong></article>
              <article><span>Workspace role</span><strong>{canary.workspaceRole ?? "No membership"}</strong></article>
              <article><span>Membership active</span><strong>{yesNo(canary.workspaceMembershipActive)}</strong></article>
              <article><span>Workspace active</span><strong>{yesNo(canary.workspaceActive)}</strong></article>
            </div>
            <footer>
              <small>
                Read-only context. This does not send WhatsApp messages, enable outbound dispatch, or grant approval.
              </small>
            </footer>
            <div className="suite-alert">
              Final canary confirmation phrase: <code>{INTERNAL_CANARY_CONFIRMATION}</code>
            </div>
          </section>
          <AdminManager />
        </div>
      </div>
    </DashboardModuleShell>
  );
}
