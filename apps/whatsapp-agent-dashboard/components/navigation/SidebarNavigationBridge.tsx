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
  "Agent Training": "/training",
  Campaigns: "/campaigns",
  Automation: "/automation",
  Templates: "/templates",
  Integrations: "/integrations",
  Admin: "/admin",
  Cutover: "/cutover",
  Settings: "/settings",
};

const LIVE_CHANNELS = new Set(["WhatsApp", "Instagram", "Messenger"]);

function createTrainingLink(pathname: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = "/training";
  link.className = `rail-button sx-navitem sx-training-injected${pathname === "/training" ? " active is-active" : ""}`;
  link.title = "Agent Training";
  link.setAttribute("aria-label", "Agent Training");
  link.setAttribute("data-sd-injected", "agent-training");
  link.setAttribute("aria-current", pathname === "/training" ? "page" : "false");
  link.innerHTML = `
    <span class="sx-navic" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">
        <path d="m2 10 10-5 10 5-10 5z"></path>
        <path d="M6 12v5c3 2 9 2 12 0v-5"></path>
        <path d="M22 10v6"></path>
      </svg>
    </span>
    <span class="sx-navlabel">Agent Training</span>
  `;
  return link;
}

function normalizeSidebarIdentity() {
  const sidebars = Array.from(
    document.querySelectorAll<HTMLElement>(".sx-inbox .sx-side, .sx-module .sx-side"),
  );

  for (const sidebar of sidebars) {
    sidebar.dataset.sidebarStandard = "v18";
  }
}

function syncModuleConnectedChannels() {
  const channelRows = Array.from(
    document.querySelectorAll<HTMLElement>(".sx-module .sx-side .sx-chan"),
  );

  for (const row of channelRows) {
    const label = row.querySelector<HTMLElement>(".sx-chan-name")?.textContent?.trim() ?? "";
    if (!LIVE_CHANNELS.has(label)) continue;

    row.classList.remove("is-pending");
    row.setAttribute("aria-label", `${label} connected`);

    const pendingTag = row.querySelector<HTMLElement>(".sx-chan-tag");
    pendingTag?.remove();

    if (!row.querySelector(".sx-chan-dot")) {
      const dot = document.createElement("span");
      dot.className = "sx-chan-dot";
      dot.setAttribute("aria-label", "Connected");
      dot.setAttribute("title", "Connected");
      row.append(dot);
    }
  }
}

export default function SidebarNavigationBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    /*
     * DashboardModuleShell renders every module directly. InboxDashboardV2
     * historically omitted Agent Training, so only that single route is added
     * here when the rebuilt Inbox sidebar is present. The guard prevents the
     * multi-nav duplicate rows that the previous generic injector created.
     */
    const ensureInboxTrainingLink = () => {
      const inboxSidebar = document.querySelector<HTMLElement>(".sx-inbox .sx-side");
      if (!inboxSidebar) return;

      const existing = inboxSidebar.querySelector<HTMLElement>(
        '[title="Agent Training"], [href="/training"], [data-sd-injected="agent-training"]',
      );
      if (existing) return;

      const manageNav = inboxSidebar.querySelector<HTMLElement>(".sx-side-group .sx-nav");
      if (!manageNav) return;

      manageNav.prepend(createTrainingLink(pathname));
    };

    ensureInboxTrainingLink();
    normalizeSidebarIdentity();
    syncModuleConnectedChannels();

    const sidebarObserver = new MutationObserver(() => {
      ensureInboxTrainingLink();
      normalizeSidebarIdentity();
      syncModuleConnectedChannels();
    });

    const dashboardRoot = document.querySelector<HTMLElement>(".sx-inbox, .sx-module");
    if (dashboardRoot) {
      sidebarObserver.observe(dashboardRoot, { childList: true, subtree: true });
      cleanups.push(() => sidebarObserver.disconnect());
    }

    for (const [title, route] of Object.entries(ROUTES)) {
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          `.rail-button[title="${title}"]`,
        ),
      );

      for (const control of controls) {
        const handler = (event: Event) => {
          if (control instanceof HTMLAnchorElement) return;
          event.preventDefault();
          router.push(route);
        };

        control.addEventListener("click", handler);
        control.setAttribute("aria-label", title);
        control.classList.toggle("active", pathname === route);
        control.classList.toggle("is-active", pathname === route);
        control.setAttribute("aria-current", pathname === route ? "page" : "false");
        cleanups.push(() => control.removeEventListener("click", handler));
      }
    }

    const brandMarks = Array.from(
      document.querySelectorAll<HTMLElement>(".brand-mark"),
    );

    for (const brandMark of brandMarks) {
      const handler = (event: Event) => {
        if (brandMark instanceof HTMLAnchorElement) return;
        event.preventDefault();
        router.push("/inbox");
      };

      brandMark.addEventListener("click", handler);
      brandMark.setAttribute("aria-label", "Open inbox");
      if (!(brandMark instanceof HTMLAnchorElement)) {
        brandMark.setAttribute("role", "button");
        brandMark.setAttribute("tabindex", "0");
      }
      cleanups.push(() => brandMark.removeEventListener("click", handler));
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [pathname, router]);

  return null;
}
