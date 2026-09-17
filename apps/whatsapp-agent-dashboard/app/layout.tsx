import type { Metadata } from "next";
import { Inter } from "next/font/google";
import SidebarNavigationBridge from "../components/navigation/SidebarNavigationBridge";
import InboxTemplatePickerBridge from "../components/templates/InboxTemplatePickerBridge";
import "./globals.css";
import "./auth.css";
import "./inbox.css";
import "./branding.css";
import "./premium-dashboard.css";
import "./premium-icons.css";
import "./premium-fixes.css";
import "./compact-header.css";
import "./final-ui.css";
import "./png-icons.css";
import "./navigation-icon-map.css";
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

const inter = Inter({ subsets: ["latin"], display: "swap" });

const DASHBOARD_BRAND_ICON = "/dashboard-icons/01-sikhadenge-brand.png";

export const metadata: Metadata = {
  title: "SikhaDenge WhatsApp Agent",
  description: "SikhaDenge-owned WhatsApp inbox, AI agent and lead dashboard.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      {
        url: DASHBOARD_BRAND_ICON,
        type: "image/png",
        sizes: "512x512",
      },
    ],
    shortcut: DASHBOARD_BRAND_ICON,
    apple: DASHBOARD_BRAND_ICON,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SidebarNavigationBridge />
        <InboxTemplatePickerBridge />
        {children}
      </body>
    </html>
  );
}
