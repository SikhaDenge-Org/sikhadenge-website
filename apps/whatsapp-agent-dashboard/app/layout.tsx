import type { Metadata } from "next";
import SidebarNavigationBridge from "../components/navigation/SidebarNavigationBridge";
import InboxTemplatePickerBridge from "../components/templates/InboxTemplatePickerBridge";
import InboxComposerDockBridge from "../components/inbox/InboxComposerDockBridge";
import ServiceWorkerRegistration from "../components/productivity/ServiceWorkerRegistration";
import "./globals.css";
import "./auth.css";
import "./inbox.css";
import "./branding.css";
import "./premium-dashboard.css";
import "./premium-icons.css";
import "./premium-fixes.css";
import "./compact-header.css";
import "./final-ui.css";
import "./balanced-ui.css";
import "./module-pages.css";
import "./knowledge-manager.css";
import "./targeting-manager.css";
import "./campaigns-module.css";
import "./campaign-control.css";
import "./automation-builder.css";
import "./platform-suite.css";
import "./media-composer.css";
import "./template-centre.css";
import "./templates-module.css";
import "./inbox-template-picker.css";
import "./contact-manager.css";
import "./lead-manager.css";
import "./team-chat.css";
import "./live-agent-manager.css";
import "./workable-dashboard.css";
import "./executive-redesign.css";
import "./executive-layout-hotfix.css";
import "./executive-sidebar-hard-lock.css";
import "./inbox-viewport-lock.css";
import "./inbox-compact-density.css";
import "./metric-strip-final.css";
import "./responsive-tablet.css";
import "./responsive-composer-fix.css";
import "./icon-free-ui.css";
import "./sidebar-icons-final.css";
import "./sidebar-scroll-clarity.css";
import "./live-header-logo.css";
import "./dashboard-refinement.css";
import "./all-modules-advanced.css";
import "./unified-sidebar.css";
import "./module-content-redesign.css";
import "./inbox-sx-composer-responsive.css";
import "./enterprise-ui-v2.css";
import "./enterprise-ui-v2-hardening.css";
import "./enterprise-product-polish.css";
import "./ui-foundation-v14.css";
import "./font-hard-lock-v15.css";
import "./login-right-panel-v16.css";
import "./sidebar-standard-v18.css";
import "./sidebar-standard-v19.css";

const DASHBOARD_FAVICON = "/sikhadenge-live-favicon-aa30502f5ec9.png";
const MANROPE_STYLESHEET = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap";

export const metadata: Metadata = {
  title: "SikhaDenge WhatsApp Agent",
  description: "SikhaDenge-owned WhatsApp inbox, AI agent and lead dashboard.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      {
        url: DASHBOARD_FAVICON,
        type: "image/png",
      },
    ],
    shortcut: DASHBOARD_FAVICON,
    apple: DASHBOARD_FAVICON,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={MANROPE_STYLESHEET} />
      </head>
      <body data-ui-foundation="manrope-v15-hard-lock">
        <ServiceWorkerRegistration />
        <SidebarNavigationBridge />
        <InboxTemplatePickerBridge />
        <InboxComposerDockBridge />
        {children}
      </body>
    </html>
  );
}
