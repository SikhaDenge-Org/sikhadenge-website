"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const ROUTES: Record<string, string> = {
  Inbox: "/inbox",
  Contacts: "/contacts",
  Leads: "/leads",
  Team: "/team",
  Engagement: "/engagement",
  Analytics: "/analytics",
  Knowledge: "/knowledge",
  Campaigns: "/campaigns",
  Automation: "/automation",
  Templates: "/templates",
  Integrations: "/integrations",
  Admin: "/admin",
  Cutover: "/cutover",
  Settings: "/settings",
};

const DYNAMIC_TITLES = [
  "Team",
  "Engagement",
  "Campaigns",
  "Automation",
  "Templates",
  "Integrations",
  "Admin",
  "Cutover",
] as const;

export default function SidebarNavigationBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    const navigationGroups = Array.from(
      document.querySelectorAll<HTMLElement>(".rail nav"),
    );
    for (const navigation of navigationGroups) {
      for (const title of DYNAMIC_TITLES) {
        if (!navigation.querySelector(`.rail-button[title="${title}"]`)) {
          const button = document.createElement("button");
          button.className = "rail-button";
          button.title = title;
          button.type = "button";
          button.textContent = title;
          navigation.appendChild(button);
          cleanups.push(() => button.remove());
        }
      }
    }

    for (const [title, route] of Object.entries(ROUTES)) {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          `.rail-button[title="${title}"]`,
        ),
      );

      for (const button of buttons) {
        const handler = () => router.push(route);
        button.addEventListener("click", handler);
        button.setAttribute("aria-label", title);
        button.classList.toggle("active", pathname === route);
        button.setAttribute("aria-current", pathname === route ? "page" : "false");
        cleanups.push(() => button.removeEventListener("click", handler));
      }
    }

    const brandMarks = Array.from(
      document.querySelectorAll<HTMLElement>(".brand-mark"),
    );

    for (const brandMark of brandMarks) {
      const handler = () => router.push("/inbox");
      brandMark.addEventListener("click", handler);
      brandMark.setAttribute("role", "button");
      brandMark.setAttribute("tabindex", "0");
      brandMark.setAttribute("aria-label", "Open inbox");
      cleanups.push(() => brandMark.removeEventListener("click", handler));
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [pathname, router]);

  return null;
}
