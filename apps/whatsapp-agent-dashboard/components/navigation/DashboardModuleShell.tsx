import Link from "next/link";
import type { ReactNode } from "react";

import LogoutButton from "../auth/LogoutButton";
import CoreWorkflowShortcuts from "./CoreWorkflowShortcuts";
import MetaConnectionStatus from "./MetaConnectionStatus";
import SidebarMenuIcon, { type SidebarMenuTitle } from "./SidebarMenuIcon";

type DashboardModuleShellProps = {
  activeTitle: SidebarMenuTitle;
  eyebrow: string;
  title: string;
  description: string;
  userName: string;
  userRole: string;
  children: ReactNode;
};

type NavItem = {
  title: SidebarMenuTitle;
  href: string;
};

type ChannelId =
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "telegram"
  | "linkedin"
  | "twitter"
  | "email"
  | "website"
  | "sms"
  | "contact-form";

type ChannelItem = {
  id: ChannelId;
  label: string;
  connected: boolean;
  href: string;
};

const PRIMARY_NAV: ReadonlySet<SidebarMenuTitle> = new Set([
  "Inbox",
  "Contacts",
  "Leads",
  "Team",
  "Engagement",
  "Analytics",
  "Knowledge",
]);

const navItems: ReadonlyArray<NavItem> = [
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
];

const channels: ReadonlyArray<ChannelItem> = [
  { id: "whatsapp", label: "WhatsApp", connected: true, href: "/inbox" },
  { id: "instagram", label: "Instagram", connected: false, href: "/integrations" },
  { id: "messenger", label: "Messenger", connected: false, href: "/integrations" },
  { id: "telegram", label: "Telegram", connected: false, href: "/integrations" },
  { id: "linkedin", label: "LinkedIn", connected: false, href: "/integrations" },
  { id: "twitter", label: "X / Twitter", connected: false, href: "/integrations" },
  { id: "email", label: "Email", connected: false, href: "/email" },
  { id: "website", label: "Website Chat", connected: false, href: "/integrations" },
  { id: "sms", label: "SMS", connected: false, href: "/integrations" },
  { id: "contact-form", label: "Contact Form", connected: false, href: "/integrations" },
];

const settingsItem: NavItem = { title: "Settings", href: "/settings" };
const primaryItems = navItems.filter((item) => PRIMARY_NAV.has(item.title));
const manageItems = navItems.filter((item) => !PRIMARY_NAV.has(item.title));
const mobileDockItems: ReadonlyArray<NavItem> = [
  navItems[0],
  navItems[1],
  navItems[2],
  navItems[8],
  settingsItem,
];

function NavigationLink({
  item,
  activeTitle,
  className = "",
}: {
  item: NavItem;
  activeTitle: SidebarMenuTitle;
  className?: string;
}) {
  const isActive = activeTitle === item.title;

  return (
    <Link
      className={`rail-button sx-navitem ${isActive ? "is-active" : ""} ${className}`.trim()}
      title={item.title}
      aria-label={item.title}
      aria-current={isActive ? "page" : undefined}
      data-nav-title={item.title}
      href={item.href}
    >
      <span className="sx-navic">
        <SidebarMenuIcon title={item.title} />
      </span>
      <span className="sx-navlabel">{item.title}</span>
    </Link>
  );
}

function ChannelGlyph({ channel, size = 16 }: { channel: ChannelId; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    focusable: false as const,
  };

  switch (channel) {
    case "whatsapp":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#25D366" />
          <path fill="#fff" d="M12 5.9a6 6 0 0 0-5.1 9.1L6 18.3l3.5-.9A6 6 0 1 0 12 5.9Zm0 1.5a4.5 4.5 0 0 1 3.8 6.9l.5 1.9-1.9-.5A4.5 4.5 0 1 1 12 7.4Zm-2.1 2.2c-.1 0-.3 0-.4.2-.2.2-.5.5-.5 1.1s.5 1.2.6 1.3c.1.2 1 1.6 2.5 2.2 1.2.5 1.5.4 1.7.4.3 0 .9-.4 1-.7.1-.3.1-.6.1-.6 0-.1-.2-.2-.4-.3l-.9-.4c-.1 0-.2 0-.3.1l-.4.5c-.1.1-.2.1-.3.1-.2-.1-.7-.3-1.3-.8-.4-.4-.7-.9-.8-1.1 0-.1 0-.2.1-.3l.2-.3v-.3l-.4-1c-.1-.2-.2-.2-.3-.2Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="module-instagram-gradient" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#FEDA75" />
              <stop offset=".35" stopColor="#FA7E1E" />
              <stop offset=".62" stopColor="#D62976" />
              <stop offset="1" stopColor="#962FBF" />
            </linearGradient>
          </defs>
          <rect width="24" height="24" rx="7" fill="url(#module-instagram-gradient)" />
          <rect x="6" y="6" width="12" height="12" rx="4" fill="none" stroke="#fff" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="2.7" fill="none" stroke="#fff" strokeWidth="1.6" />
          <circle cx="15.6" cy="8.4" r="1" fill="#fff" />
        </svg>
      );
    case "messenger":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#0084FF" />
          <path fill="#fff" d="M12 6c-3.4 0-6 2.5-6 5.6 0 1.7.8 3.2 2.1 4.2v2.2l2-1.1c.6.2 1.2.3 1.9.3 3.4 0 6-2.5 6-5.6S15.4 6 12 6Zm.4 7.5-1.7-1.7-3 1.7 3.3-3.5 1.7 1.7 3-1.7-3.3 3.5Z" />
        </svg>
      );
    case "telegram":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#29A9EA" />
          <path fill="#fff" d="m17.6 7.7-1.9 9c-.1.6-.5.7-1 .5l-2.7-2-1.3 1.3c-.2.1-.3.3-.6.3l.2-2.9 5.2-4.7c.2-.2 0-.3-.4-.1L8.7 13l-2.7-.8c-.6-.2-.6-.6.1-.9l10.5-4c.5-.2.9.1.7.9Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#0A66C2" />
          <circle cx="7" cy="7" r="1.45" fill="#fff" />
          <rect x="5.6" y="9.5" width="2.8" height="8.6" rx=".5" fill="#fff" />
          <path fill="#fff" d="M10.2 9.5H13v1.15c.75-.9 1.75-1.45 3.2-1.45 2.55 0 3.9 1.65 3.9 4.7v4.2h-2.85v-3.85c0-1.65-.55-2.45-1.8-2.45-1.45 0-2.4 1-2.4 2.9v3.4H10.2V9.5Z" />
        </svg>
      );
    case "twitter":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#111111" />
          <path d="M7 6.4 17.2 17.8M17 6.3 7.1 17.8" fill="none" stroke="#fff" strokeWidth="2.15" strokeLinecap="round" />
        </svg>
      );
    case "email":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#EA4335" />
          <rect x="5" y="7" width="14" height="10" rx="2" fill="none" stroke="#fff" strokeWidth="1.7" />
          <path d="m6 8 6 5 6-5" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "website":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#14B8A6" />
          <circle cx="12" cy="11" r="6" fill="none" stroke="#fff" strokeWidth="1.5" />
          <path d="M6.3 11h11.4M12 5c1.8 1.7 2.7 3.7 2.7 6S13.8 15.3 12 17M12 5c-1.8 1.7-2.7 3.7-2.7 6s.9 4.3 2.7 6" fill="none" stroke="#fff" strokeWidth="1.25" strokeLinecap="round" />
          <path d="m15.5 17.5 2.7 1.3-.7-2.8" fill="#14B8A6" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "sms":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#22C55E" />
          <path d="M6 6.5h12v8.4H11l-4 3v-3H6z" fill="none" stroke="#fff" strokeWidth="1.65" strokeLinejoin="round" />
          <circle cx="9" cy="10.7" r=".8" fill="#fff" />
          <circle cx="12" cy="10.7" r=".8" fill="#fff" />
          <circle cx="15" cy="10.7" r=".8" fill="#fff" />
        </svg>
      );
    case "contact-form":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#F59E0B" />
          <path d="M7.5 5.5h6.2l3.3 3.3v9.7H7.5z" fill="none" stroke="#fff" strokeWidth="1.55" strokeLinejoin="round" />
          <path d="M13.7 5.7v3.2h3.1M10 12h4.5M10 15h4.5" fill="none" stroke="#fff" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function ChannelLink({ channel }: { channel: ChannelItem }) {
  return (
    <Link
      className={`sx-chan ${channel.connected ? "is-active" : "is-pending"}`}
      href={channel.href}
      aria-label={channel.connected ? `${channel.label} connected` : `Connect ${channel.label}`}
    >
      <span className="sx-chan-ic"><ChannelGlyph channel={channel.id} /></span>
      <span className="sx-chan-name">{channel.label}</span>
      {channel.connected ? (
        <span className="sx-chan-dot" aria-label="Connected" title="Connected" />
      ) : (
        <span className="sx-chan-tag">Connect</span>
      )}
    </Link>
  );
}

export default function DashboardModuleShell({
  activeTitle,
  eyebrow,
  title,
  description,
  userName,
  userRole,
  children,
}: DashboardModuleShellProps) {
  const initials = userName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <div className="sx-module">
      <CoreWorkflowShortcuts />
      <a className="sx-skip-link" href="#dashboard-main">
        Skip to dashboard content
      </a>

      <aside className="sx-side rail" aria-label="Primary navigation">
        <Link className="brand-mark sx-brand" href="/inbox" aria-label="Open inbox">
          <span className="sx-brand-logo">
            <img src="/sikhadenge-header-safe-320.png" alt="" width={26} height={26} />
          </span>
          <span className="sx-brand-name">
            SikhaDenge
            <small>WhatsApp AI</small>
          </span>
        </Link>

        <div className="sx-side-scroll">
          <nav className="sx-nav" aria-label="Core modules">
            {primaryItems.map((item) => (
              <NavigationLink
                key={item.title}
                item={item}
                activeTitle={activeTitle}
              />
            ))}
          </nav>

          <div className="sx-channels" aria-label="Channels">
            <p className="sx-side-label">Channels</p>
            <div className="sx-channels-list">
              {channels.map((channel) => (
                <ChannelLink key={channel.id} channel={channel} />
              ))}
            </div>
          </div>

          <div className="sx-side-group">
            <p className="sx-side-label">Manage</p>
            <nav className="sx-nav" aria-label="Management modules">
              {manageItems.map((item) => (
                <NavigationLink
                  key={item.title}
                  item={item}
                  activeTitle={activeTitle}
                />
              ))}
            </nav>
          </div>
        </div>

        <div className="sx-side-foot">
          <NavigationLink item={settingsItem} activeTitle={activeTitle} />

          <div className="sx-account">
            <span className="sx-acc-avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="sx-acc-copy">
              <strong>{userName}</strong>
              <small>{userRole.toLowerCase()}</small>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>

      <main id="dashboard-main" className="sx-workspace" tabIndex={-1}>
        <header className="sx-workspace-head">
          <div className="sx-workspace-head-left">
            <details className="sx-mobile-nav">
              <summary aria-label="Open all dashboard modules">
                <SidebarMenuIcon title={activeTitle} size={20} />
                <span>Menu</span>
              </summary>
              <div className="sx-mobile-nav-panel">
                <div className="sx-mobile-nav-heading">
                  <div>
                    <strong>All modules</strong>
                    <span>{userName}</span>
                  </div>
                  <MetaConnectionStatus />
                </div>
                <nav aria-label="All dashboard modules">
                  {[...navItems, settingsItem].map((item) => (
                    <NavigationLink
                      key={item.title}
                      item={item}
                      activeTitle={activeTitle}
                      className="sx-mobile-menu-link"
                    />
                  ))}
                </nav>
              </div>
            </details>

            <span className="sx-workspace-icon">
              <SidebarMenuIcon title={activeTitle} size={22} />
            </span>
            <div className="sx-workspace-copy">
              <p className="sx-workspace-eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
              <p className="sx-workspace-description">{description}</p>
            </div>
          </div>
          <div className="sx-workspace-head-right">
            <MetaConnectionStatus />
            <span className="sx-workspace-badge">{activeTitle} module</span>
          </div>
        </header>

        <div className="sx-workspace-body">{children}</div>
      </main>

      <nav className="sx-mobile-dock" aria-label="Mobile quick navigation">
        {mobileDockItems.map((item) => (
          <NavigationLink
            key={item.title}
            item={item}
            activeTitle={activeTitle}
            className="sx-mobile-dock-link"
          />
        ))}
      </nav>
    </div>
  );
}
