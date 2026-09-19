"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./email-workspace-nav.module.css";

const ITEMS = [
  ["Overview", "/email", "Command center", "◇"],
  ["Inbox", "/email/inbox", "Unified threads", "✉"],
  ["Accounts", "/email/accounts", "Gmail & senders", "@"],
  ["Templates", "/email/templates", "Reusable designs", "▤"],
  ["Send", "/email/send", "Manual send", "↗"],
  ["Campaigns", "/email/campaigns", "Audience delivery", "◎"],
  ["Sequences", "/email/sequences", "Lifecycle journeys", "⋮"],
  ["Automation", "/email/automation", "Queue & runtime", "ϟ"],
] as const;

export default function EmailWorkspaceNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Email workspace" className={styles.nav}>
      {ITEMS.map(([label, href, helper, icon]) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`${styles.item} ${active ? styles.active : ""}`}
          >
            <span className={styles.icon} aria-hidden="true">{icon}</span>
            <span className={styles.copy}>
              <strong>{label}</strong>
              <small>{helper}</small>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
