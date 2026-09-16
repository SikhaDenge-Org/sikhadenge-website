"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["Overview", "/email", "Command center"],
  ["Accounts", "/email/accounts", "Gmail & senders"],
  ["Templates", "/email/templates", "Reusable email designs"],
  ["Send", "/email/send", "Manual transactional send"],
  ["Automation", "/email/automation", "Queue & runtime"],
] as const;

export default function EmailWorkspaceNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Email workspace" style={{
      display: "grid",
      gridTemplateColumns: "repeat(5,minmax(0,1fr))",
      gap: 10,
      marginBottom: 22,
      padding: 8,
      border: "1px solid #dce4f2",
      borderRadius: 18,
      background: "rgba(255,255,255,.88)",
      boxShadow: "0 12px 30px rgba(31,41,55,.06)",
    }}>
      {ITEMS.map(([label, href, helper]) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} style={{
            display: "block",
            minWidth: 0,
            padding: "12px 14px",
            borderRadius: 13,
            textDecoration: "none",
            color: active ? "#fff" : "#172033",
            background: active ? "linear-gradient(135deg,#315cf6,#7748f7)" : "transparent",
            border: active ? "1px solid transparent" : "1px solid transparent",
            transition: "150ms ease",
          }}>
            <strong style={{ display: "block", fontSize: 14 }}>{label}</strong>
            <small style={{ display: "block", marginTop: 3, opacity: active ? .82 : .58, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {helper}
            </small>
          </Link>
        );
      })}
    </nav>
  );
}
