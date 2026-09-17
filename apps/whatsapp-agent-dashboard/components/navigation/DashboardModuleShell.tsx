import Link from "next/link";
import type { ReactNode } from "react";

import LogoutButton from "../auth/LogoutButton";
import MetaConnectionStatus from "./MetaConnectionStatus";

type DashboardModuleShellProps = {
  activeTitle:
    | "Inbox"
    | "Contacts"
    | "Leads"
    | "Team"
    | "Engagement"
    | "Analytics"
    | "Knowledge"
    | "Agent Training"
    | "Campaigns"
    | "Automation"
    | "Templates"
    | "Integrations"
    | "Admin"
    | "Cutover"
    | "Settings";
  eyebrow: string;
  title: string;
  description: string;
  userName: string;
  userRole: string;
  children: ReactNode;
};

const navItems = [
  { title: "Inbox", href: "/inbox" },
  { title: "Contacts", href: "/contacts" },
  { title: "Leads", href: "/leads" },
  { title: "Team", href: "/team" },
  { title: "Engagement", href: "/engagement" },
  { title: "Analytics", href: "/analytics" },
  { title: "Knowledge", href: "/knowledge" },
  { title: "Agent Training", href: "/training" },
  { title: "Campaigns", href: "/campaigns" },
  { title: "Automation", href: "/automation" },
  { title: "Templates", href: "/templates" },
  { title: "Integrations", href: "/integrations" },
  { title: "Admin", href: "/admin" },
  { title: "Cutover", href: "/cutover" },
] as const;

const moduleIcons: Record<DashboardModuleShellProps["activeTitle"], string> = {
  Inbox: "/dashboard-icons/02-conversations.png",
  Contacts: "/dashboard-icons/03-contacts.png",
  Leads: "/dashboard-icons/05-qualified-leads.png",
  Team: "/dashboard-icons/04-ai-managed.png",
  Engagement: "/dashboard-icons/03-contacts.png",
  Analytics: "/dashboard-icons/07-analytics.png",
  Knowledge: "/dashboard-icons/08-knowledge.png",
  "Agent Training": "/dashboard-icons/08-knowledge.png",
  Campaigns: "/dashboard-icons/09-automation.png",
  Automation: "/dashboard-icons/09-automation.png",
  Templates: "/dashboard-icons/04-ai-managed.png",
  Integrations: "/dashboard-icons/10-settings.png",
  Admin: "/dashboard-icons/10-settings.png",
  Cutover: "/dashboard-icons/10-settings.png",
  Settings: "/dashboard-icons/10-settings.png",
};

export default function DashboardModuleShell({
  activeTitle,
  eyebrow,
  title,
  description,
  userName,
  userRole,
  children,
}: DashboardModuleShellProps) {
  const moduleKey = activeTitle.toLowerCase();

  return (
    <>
      <div className="session-toolbar" aria-label="Signed-in account">
        <span>
          <strong>{userName}</strong>
          <small>{userRole.toLowerCase()}</small>
        </span>
        <LogoutButton />
      </div>

      <main className="dashboard-shell">
        <aside className="rail" aria-label="Primary navigation">
          <Link className="brand-mark" href="/inbox" aria-label="Open inbox">
            S
          </Link>
          <nav>
            {navItems.map((item) => (
              <Link
                key={item.title}
                className={`rail-button ${activeTitle === item.title ? "active" : ""}`}
                title={item.title}
                aria-label={item.title}
                aria-current={activeTitle === item.title ? "page" : undefined}
                href={item.href}
              >
                {item.title}
              </Link>
            ))}
          </nav>
          <Link
            className={`rail-button rail-bottom ${activeTitle === "Settings" ? "active" : ""}`}
            title="Settings"
            aria-label="Settings"
            aria-current={activeTitle === "Settings" ? "page" : undefined}
            href="/settings"
          >
            Settings
          </Link>
        </aside>

        <section className="workspace module-workspace">
          <header className="topbar">
            <div>
              <p className="eyebrow">SikhaDenge owned system</p>
              <h1>WhatsApp AI Agent</h1>
            </div>
            <div className="topbar-actions">
              <div className="system-status"><span /> Database connected</div>
              <MetaConnectionStatus />
            </div>
          </header>

          <section className="module-page-card" data-module={moduleKey}>
            <header className="module-page-header">
              <div className="module-page-heading">
                <div className="module-page-icon" aria-hidden="true">
                  <img src={moduleIcons[activeTitle]} alt="" />
                </div>
                <div className="module-page-copy">
                  <p className="eyebrow">{eyebrow}</p>
                  <h2>{title}</h2>
                  <p>{description}</p>
                </div>
              </div>
              <span className="module-page-badge">{activeTitle} module</span>
            </header>
            <div className="module-page-content">{children}</div>
          </section>
        </section>
      </main>
    </>
  );
}
