"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  InboxConversationDetail,
  InboxConversationSummary,
  InboxMessage,
} from "../../lib/inbox/types";
import {
  clearLocalDraft,
  getOrCreateDraftDeviceId,
  persistLocalDraft,
  restoreLocalDraft,
} from "../../modules/productivity/application/local-draft-store";
import MetaConnectionStatus from "../navigation/MetaConnectionStatus";
import LogoutButton from "../auth/LogoutButton";

type ConversationFilter = "ALL" | "UNREAD" | "HOT";
type ConversationScope = "RECENT" | "HISTORY";
type UserSettableMode = "AI" | "HUMAN" | "PAUSED";
type MobileView = "LIST" | "CHAT";
type UploadedMedia = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "document" | "video" | "audio";
  size: number;
  createdAt: string;
  previewUrl: string;
};

type InboxDashboardProps = {
  initialConversations: InboxConversationSummary[];
  initialConversation: InboxConversationDetail | null;
  userName?: string;
  userRole?: string;
};

const NAV_ITEMS = [
  ["Inbox", "/inbox"],
  ["Contacts", "/contacts"],
  ["Leads", "/leads"],
  ["Team", "/team"],
  ["Engagement", "/engagement"],
  ["Analytics", "/analytics"],
  ["Knowledge", "/knowledge"],
  ["Campaigns", "/campaigns"],
  ["Automation", "/automation"],
  ["Templates", "/templates"],
  ["Integrations", "/integrations"],
  ["Admin", "/admin"],
  ["Cutover", "/cutover"],
] as const;

// Primary items shown as the main sidebar nav; the rest sit under "Manage".
const PRIMARY_NAV = new Set(["Inbox", "Contacts", "Leads", "Team", "Engagement", "Analytics", "Knowledge"]);

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function temperatureClass(value?: string | null): string {
  const normalized = value?.toLowerCase();
  if (normalized === "hot" || normalized === "warm") return normalized;
  return "cold";
}

function temperatureLabel(value?: string | null): string {
  return value?.replaceAll("_", " ") || "COLD";
}

function readable(value?: string | null): string {
  return value?.replaceAll("_", " ") || "Not captured";
}

function formatListTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat("en-IN", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short" }).format(date);
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function messagePreview(item: InboxConversationSummary): string {
  if (item.lastMessage?.text) return item.lastMessage.text;
  if (item.lastMessage?.type) return `[${readable(item.lastMessage.type)}]`;
  return "No messages yet";
}

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function suggestedReply(action: string): string {
  if (action.includes("occupation")) return "Aap abhi job, business ya study mein kya kar rahe hain?";
  if (action.includes("primary goal")) return "Aapka main career ya learning goal kya hai?";
  if (action.includes("suitable program")) return "Aap kis skill ya course mein sabse zyada interested hain?";
  if (action.includes("joining timeline")) return "Aap course kab tak start karna chahte hain?";
  if (action.includes("counselor")) return "Kya main aapke liye counselor call arrange kar doon?";
  return "Kripya apni requirement thodi detail mein share kijiye.";
}

function TemperatureBadge({ value }: { value?: string | null }) {
  return (
    <span className={`sx-temp sx-temp-${temperatureClass(value)}`}>
      {temperatureLabel(value)}
    </span>
  );
}

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

type ChannelDef = {
  id: ChannelId;
  label: string;
  connected: boolean;
};

// WhatsApp, Instagram, and Messenger have live inbound transports.
// Remaining channels stay disabled until their transport is implemented.
const CHANNELS: ChannelDef[] = [
  { id: "whatsapp", label: "WhatsApp", connected: true },
  { id: "instagram", label: "Instagram", connected: true },
  { id: "messenger", label: "Messenger", connected: true },
  { id: "telegram", label: "Telegram", connected: false },
  { id: "linkedin", label: "LinkedIn", connected: false },
  { id: "twitter", label: "X / Twitter", connected: false },
  { id: "email", label: "Email", connected: false },
  { id: "website", label: "Website Chat", connected: false },
  { id: "sms", label: "SMS", connected: false },
  { id: "contact-form", label: "Contact Form", connected: false },
];

function channelOf(conversation: InboxConversationSummary): ChannelId {
  const source = conversation.source?.trim().toLowerCase();

  if (source === "instagram") {
    return "instagram";
  }

  if (source === "messenger") {
    return "messenger";
  }

  return "whatsapp";
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
          <path
            fill="#fff"
            d="M12 5.9a6 6 0 0 0-5.1 9.1L6 18.3l3.5-.9A6 6 0 1 0 12 5.9Zm0 1.5a4.5 4.5 0 0 1 3.8 6.9l.5 1.9-1.9-.5A4.5 4.5 0 1 1 12 7.4Zm-2.1 2.2c-.1 0-.3 0-.4.2-.2.2-.5.5-.5 1.1s.5 1.2.6 1.3c.1.2 1 1.6 2.5 2.2 1.2.5 1.5.4 1.7.4.3 0 .9-.4 1-.7.1-.3.1-.6.1-.6 0-.1-.2-.2-.4-.3l-.9-.4c-.1 0-.2 0-.3.1l-.4.5c-.1.1-.2.1-.3.1-.2-.1-.7-.3-1.3-.8-.4-.4-.7-.9-.8-1.1 0-.1 0-.2.1-.3l.2-.3v-.3l-.4-1c-.1-.2-.2-.2-.3-.2Z"
          />
        </svg>
      );

    case "instagram":
      return (
        <svg {...common}>
          <defs>
            <linearGradient id="channel-instagram-gradient" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#FEDA75" />
              <stop offset=".35" stopColor="#FA7E1E" />
              <stop offset=".62" stopColor="#D62976" />
              <stop offset="1" stopColor="#962FBF" />
            </linearGradient>
          </defs>
          <rect width="24" height="24" rx="7" fill="url(#channel-instagram-gradient)" />
          <rect
            x="6"
            y="6"
            width="12"
            height="12"
            rx="4"
            fill="none"
            stroke="#fff"
            strokeWidth="1.6"
          />
          <circle
            cx="12"
            cy="12"
            r="2.7"
            fill="none"
            stroke="#fff"
            strokeWidth="1.6"
          />
          <circle cx="15.6" cy="8.4" r="1" fill="#fff" />
        </svg>
      );

    case "messenger":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#0084FF" />
          <path
            fill="#fff"
            d="M12 6c-3.4 0-6 2.5-6 5.6 0 1.7.8 3.2 2.1 4.2v2.2l2-1.1c.6.2 1.2.3 1.9.3 3.4 0 6-2.5 6-5.6S15.4 6 12 6Zm.4 7.5-1.7-1.7-3 1.7 3.3-3.5 1.7 1.7 3-1.7-3.3 3.5Z"
          />
        </svg>
      );

    case "telegram":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#29A9EA" />
          <path
            fill="#fff"
            d="m17.6 7.7-1.9 9c-.1.6-.5.7-1 .5l-2.7-2-1.3 1.3c-.2.1-.3.3-.6.3l.2-2.9 5.2-4.7c.2-.2 0-.3-.4-.1L8.7 13l-2.7-.8c-.6-.2-.6-.6.1-.9l10.5-4c.5-.2.9.1.7.9Z"
          />
        </svg>
      );

    case "linkedin":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#0A66C2" />
          <circle cx="7" cy="7" r="1.45" fill="#fff" />
          <rect x="5.6" y="9.5" width="2.8" height="8.6" rx=".5" fill="#fff" />
          <path
            fill="#fff"
            d="M10.2 9.5H13v1.15c.75-.9 1.75-1.45 3.2-1.45 2.55 0 3.9 1.65 3.9 4.7v4.2h-2.85v-3.85c0-1.65-.55-2.45-1.8-2.45-1.45 0-2.4 1-2.4 2.9v3.4H10.2V9.5Z"
          />
        </svg>
      );

    case "twitter":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#111111" />
          <path
            d="M7 6.4 17.2 17.8M17 6.3 7.1 17.8"
            fill="none"
            stroke="#fff"
            strokeWidth="2.15"
            strokeLinecap="round"
          />
        </svg>
      );

    case "email":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#EA4335" />
          <rect
            x="5"
            y="7"
            width="14"
            height="10"
            rx="2"
            fill="none"
            stroke="#fff"
            strokeWidth="1.7"
          />
          <path
            d="m6 8 6 5 6-5"
            fill="none"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "website":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#14B8A6" />
          <circle
            cx="12"
            cy="11"
            r="6"
            fill="none"
            stroke="#fff"
            strokeWidth="1.5"
          />
          <path
            d="M6.3 11h11.4M12 5c1.8 1.7 2.7 3.7 2.7 6S13.8 15.3 12 17M12 5c-1.8 1.7-2.7 3.7-2.7 6s.9 4.3 2.7 6"
            fill="none"
            stroke="#fff"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <path
            d="m15.5 17.5 2.7 1.3-.7-2.8"
            fill="#14B8A6"
            stroke="#fff"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "sms":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#22C55E" />
          <path
            d="M6 6.5h12v8.4H11l-4 3v-3H6z"
            fill="none"
            stroke="#fff"
            strokeWidth="1.65"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="10.7" r=".8" fill="#fff" />
          <circle cx="12" cy="10.7" r=".8" fill="#fff" />
          <circle cx="15" cy="10.7" r=".8" fill="#fff" />
        </svg>
      );

    case "contact-form":
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="7" fill="#F59E0B" />
          <path
            d="M7.5 5.5h6.2l3.3 3.3v9.7H7.5z"
            fill="none"
            stroke="#fff"
            strokeWidth="1.55"
            strokeLinejoin="round"
          />
          <path
            d="M13.7 5.7v3.2h3.1M10 12h4.5M10 15h4.5"
            fill="none"
            stroke="#fff"
            strokeWidth="1.45"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    default:
      return null;
  }
}

// Line-style UI icons (Lucide-flavoured) drawn with currentColor.
function Ic({ name, size = 18 }: { name: string; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false as const,
  };
  switch (name) {
    case "inbox":
      return (<svg {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>);
    case "contacts":
      return (<svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
    case "leads":
      return (<svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>);
    case "team":
      return (<svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
    case "engagement":
      return (<svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>);
    case "analytics":
      return (<svg {...p}><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>);
    case "knowledge":
      return (<svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>);
    case "campaigns":
      return (<svg {...p}><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>);
    case "automation":
      return (<svg {...p}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>);
    case "templates":
      return (<svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>);
    case "integrations":
      return (<svg {...p}><path d="m12 2 9 5-9 5-9-5 9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></svg>);
    case "admin":
      return (<svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);
    case "cutover":
      return (<svg {...p}><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></svg>);
    case "settings":
      return (<svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);
    case "search":
      return (<svg {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>);
    case "compose":
      return (<svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>);
    case "refresh":
      return (<svg {...p}><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" /><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>);
    case "more":
      return (<svg {...p} strokeWidth={2}><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></svg>);
    case "back":
      return (<svg {...p}><path d="m15 18-6-6 6-6" /></svg>);
    case "send":
      return (<svg {...p}><path d="m22 2-7 20-4-9-9-4 20-7z" /><path d="M22 2 11 13" /></svg>);
    case "plus":
      return (<svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></svg>);
    case "paperclip":
      return (<svg {...p}><path d="m21.44 11.05-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" /></svg>);
    case "sparkle":
      return (<svg {...p}><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z" /></svg>);
    case "grid":
      return (<svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>);
    case "x":
      return (<svg {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>);
    case "phone":
      return (<svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>);
    case "video":
      return (<svg {...p}><path d="m23 7-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>);
    default:
      return null;
  }
}

function MessageMedia({ message }: { message: InboxMessage }) {
  if (!message.mediaUrl) return null;

  const mimeType =
    message.mimeType?.trim().toLowerCase() || "";

  const isImage =
    message.type === "IMAGE" ||
    mimeType.startsWith("image/");

  const isVideo =
    message.type === "VIDEO" ||
    mimeType.startsWith("video/");

  const isAudio =
    message.type === "AUDIO" ||
    mimeType.startsWith("audio/");

  if (isImage) {
    return (
      <a
        className="sx-msg-media"
        href={message.mediaUrl}
        target="_blank"
        rel="noreferrer"
      >
        <img
          className="sx-msg-image"
          src={message.mediaUrl}
          alt={message.filename || "Shared image"}
        />
      </a>
    );
  }

  if (isVideo) {
    return (
      <video
        className="sx-msg-video"
        src={message.mediaUrl}
        controls
        preload="metadata"
      />
    );
  }

  if (isAudio) {
    return (
      <audio
        className="sx-msg-audio"
        src={message.mediaUrl}
        controls
        preload="metadata"
      />
    );
  }

  const fileLabel =
    mimeType === "application/pdf"
      ? "PDF"
      : "FILE";

  return (
    <a
      className="sx-msg-doc"
      href={message.mediaUrl}
      target="_blank"
      rel="noreferrer"
    >
      <span aria-hidden="true">
        {fileLabel}
      </span>
      <strong>
        {message.filename || "Open attachment"}
      </strong>
    </a>
  );
}

export default function InboxDashboardV2({
  initialConversations,
  initialConversation,
  userName = "Account",
  userRole = "operator",
}: InboxDashboardProps) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversation?.id ?? initialConversations[0]?.id ?? null,
  );
  const [selected, setSelected] = useState<InboxConversationDetail | null>(initialConversation);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("ALL");
  const [channelFilter, setChannelFilter] = useState<ChannelId>("whatsapp");
  const [scope, setScope] = useState<ConversationScope>("RECENT");
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [modeUpdating, setModeUpdating] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<{
    conversationId: string | null;
    body: string;
    hydrated: boolean;
  }>({
    conversationId:
      initialConversation?.id ??
      initialConversations[0]?.id ??
      null,
    body: "",
    hydrated: false,
  });

  const draft =
    draftState.conversationId === selectedId
      ? draftState.body
      : "";
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>(
    initialConversation ? "CHAT" : "LIST",
  );
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedIdRef = useRef(selectedId);
  const pollingRef = useRef(false);
  const messageAreaRef = useRef<HTMLDivElement>(null);
  const draftRevisionRef = useRef(0);
  const draftSavedAtRef = useRef<Date>(new Date(0));
  const draftDeviceIdRef = useRef<string | null>(null);

  function setDraft(
    next:
      | string
      | ((current: string) => string),
  ) {
    const conversationId =
      selectedIdRef.current;

    if (!conversationId) {
      return;
    }

    setDraftState((current) => {
      const currentBody =
        current.conversationId === conversationId
          ? current.body
          : "";

      const nextBody =
        typeof next === "function"
          ? next(currentBody)
          : next;

      if (nextBody !== currentBody) {
        draftRevisionRef.current += 1;
        draftSavedAtRef.current = new Date();
      }

      return {
        conversationId,
        body: nextBody,
        hydrated: true,
      };
    });
  }

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      draftRevisionRef.current = 0;
      draftSavedAtRef.current = new Date(0);
      draftDeviceIdRef.current = null;

      setDraftState({
        conversationId: null,
        body: "",
        hydrated: true,
      });

      return;
    }

    const recovered =
      restoreLocalDraft(
        window.localStorage,
        selectedId,
      );

    draftRevisionRef.current =
      recovered?.revision ?? 0;

    draftSavedAtRef.current =
      recovered?.savedAt ?? new Date();

    draftDeviceIdRef.current =
      recovered?.deviceId ??
      getOrCreateDraftDeviceId(
        window.localStorage,
      );

    setDraftState({
      conversationId: selectedId,
      body: recovered?.body ?? "",
      hydrated: true,
    });
  }, [selectedId]);

  useEffect(() => {
    if (
      !selectedId ||
      !draftState.hydrated ||
      draftState.conversationId !== selectedId
    ) {
      return;
    }

    if (draftState.body.length === 0) {
      clearLocalDraft(
        window.localStorage,
        selectedId,
      );

      return;
    }

    const deviceId =
      draftDeviceIdRef.current ??
      getOrCreateDraftDeviceId(
        window.localStorage,
      );

    draftDeviceIdRef.current =
      deviceId;

    persistLocalDraft(
      window.localStorage,
      {
        conversationId: selectedId,
        body: draftState.body,
        revision: draftRevisionRef.current,
        savedAt: draftSavedAtRef.current,
        deviceId,
      },
    );
  }, [
    selectedId,
    draftState,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (pollingRef.current || document.visibilityState === "hidden") return;
      pollingRef.current = true;
      try {
        const response = await fetch(
          `/api/conversations?scope=${scope.toLowerCase()}&limit=all`,
          { cache: "no-store" },
        );
        if (response.status === 401) {
          window.location.assign("/login");
          return;
        }
        const body = (await response.json()) as {
          conversations?: InboxConversationSummary[];
        };
        if (!response.ok || !body.conversations || cancelled) return;

        setConversations(body.conversations);

        const currentId =
          selectedIdRef.current;

        const currentStillVisible =
          currentId
            ? body.conversations.some(
                (item) =>
                  item.id === currentId,
              )
            : false;

        const activeId =
          currentStillVisible
            ? currentId
            : body.conversations[0]?.id
              ?? null;

        if (activeId !== currentId) {
          selectedIdRef.current =
            activeId;
          setSelectedId(activeId);
        }

        if (!activeId) {
          setSelected(null);
          return;
        }

        const detailResponse = await fetch(
          `/api/conversations/${encodeURIComponent(activeId)}`,
          { cache: "no-store" },
        );
        if (!detailResponse.ok || cancelled) return;
        const detailBody = (await detailResponse.json()) as {
          conversation?: InboxConversationDetail;
        };
        if (detailBody.conversation) setSelected(detailBody.conversation);
      } catch {
        // The next one-second poll retries without clearing the visible inbox.
      } finally {
        pollingRef.current = false;
      }
    }

    void poll();

    const pollInterval =
      scope === "RECENT"
        ? 1_000
        : 10_000;

    const timer = window.setInterval(
      () => void poll(),
      pollInterval,
    );
    const visibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [scope]);

  useEffect(() => {
    messageAreaRef.current?.scrollTo({
      top: messageAreaRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [selected?.messages.length]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((item) => {
      const matchesQuery =
        !query ||
        item.contact.name.toLowerCase().includes(query) ||
        item.contact.phone.toLowerCase().includes(query) ||
        item.lead?.interestedCourse?.toLowerCase().includes(query);
      const matchesFilter =
        filter === "ALL" ||
        (filter === "UNREAD" && item.unreadCount > 0) ||
        (filter === "HOT" && item.lead?.temperature === "HOT");
      const matchesChannel = channelOf(item) === channelFilter;
      return Boolean(matchesQuery && matchesFilter && matchesChannel);
    });
  }, [conversations, filter, search, channelFilter]);

  const channelUnread = useMemo(() => {
    const totals = Object.fromEntries(
      CHANNELS.map((channel) => [channel.id, 0]),
    ) as Record<ChannelId, number>;
    for (const item of conversations) {
      totals[channelOf(item)] += item.unreadCount;
    }
    return totals;
  }, [conversations]);

  const activeChannel = CHANNELS.find((item) => item.id === channelFilter) ?? CHANNELS[0];

  const metrics = useMemo(() => {
    const open = conversations.filter((item) => item.status !== "CLOSED").length;
    const aiManaged = conversations.filter((item) => item.agentMode === "AI").length;
    const qualified = conversations.filter((item) => (item.lead?.score ?? 0) >= 45).length;
    const unread = conversations.reduce((total, item) => total + item.unreadCount, 0);
    return { open, aiManaged, qualified, unread };
  }, [conversations]);

  const selectedSummary =
    selected ?? conversations.find((item) => item.id === selectedId) ?? null;

  function changeConversationScope(
    nextScope: ConversationScope,
  ) {
    if (nextScope === scope) return;

    selectedIdRef.current = null;
    setSelectedId(null);
    setSelected(null);
    setMobileDetailsOpen(false);
    setScope(nextScope);
  }

  async function markRead(conversationId: string) {
    const response = await fetch(
      `/api/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: "POST" },
    );
    if (response.status === 401) {
      window.location.assign("/login");
      return;
    }
    if (!response.ok) return;
    setConversations((current) =>
      current.map((item) => item.id === conversationId ? { ...item, unreadCount: 0 } : item),
    );
    setSelected((current) => current?.id === conversationId ? { ...current, unreadCount: 0 } : current);
  }

  async function loadConversation(conversationId: string, force = false) {
    selectedIdRef.current = conversationId;
    setSelectedId(conversationId);
    setActionMenuOpen(false);
    if (!force && selected?.id === conversationId) {
      await markRead(conversationId);
      return;
    }

    setLoadingConversation(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}`,
        { cache: "no-store" },
      );
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = (await response.json()) as {
        conversation?: InboxConversationDetail;
        error?: string;
      };
      if (!response.ok || !body.conversation) {
        throw new Error(body.error || "Conversation could not be loaded.");
      }
      setSelected(body.conversation);
      setConversations((current) =>
        current.map((item) => item.id === body.conversation?.id ? body.conversation : item),
      );
      await markRead(conversationId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Conversation could not be loaded.");
    } finally {
      setLoadingConversation(false);
    }
  }

  async function changeMode(mode: UserSettableMode) {
    if (!selectedId || modeUpdating) return;
    setModeUpdating(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(selectedId)}/mode`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            reason: mode === "HUMAN"
              ? "Manual counselor takeover from inbox dashboard."
              : "Conversation mode changed from inbox dashboard.",
          }),
        },
      );
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = (await response.json()) as {
        conversation?: { agentMode: string };
        error?: string;
      };
      if (!response.ok || !body.conversation) {
        throw new Error(body.error || "Conversation mode could not be changed.");
      }
      const nextMode = body.conversation.agentMode;
      setSelected((current) => current ? { ...current, agentMode: nextMode } : current);
      setConversations((current) =>
        current.map((item) => item.id === selectedId ? { ...item, agentMode: nextMode } : item),
      );
    } catch (modeError) {
      setError(modeError instanceof Error ? modeError.message : "Conversation mode could not be changed.");
    } finally {
      setModeUpdating(false);
    }
  }

  async function updateStatus(status: "OPEN" | "RESOLVED") {
    if (!selectedId || operationBusy) return;
    setOperationBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(selectedId)}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, reason: "Updated from inbox action menu." }),
        },
      );
      const body = (await response.json()) as {
        conversation?: { status: string; unreadCount: number };
        error?: string;
      };
      if (!response.ok || !body.conversation) {
        throw new Error(body.error || "Conversation status could not be changed.");
      }
      setConversations((current) => current.map((item) =>
        item.id === selectedId
          ? { ...item, status: body.conversation!.status, unreadCount: body.conversation!.unreadCount }
          : item,
      ));
      setSelected((current) => current
        ? { ...current, status: body.conversation!.status, unreadCount: body.conversation!.unreadCount }
        : current,
      );
      setActionMenuOpen(false);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Conversation status could not be changed.");
    } finally {
      setOperationBusy(false);
    }
  }

  async function uploadAttachment(file: File) {
    setUploading(true);
    setError(null);
    setComposerNotice(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/media/upload", { method: "POST", body: formData });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = (await response.json()) as { asset?: UploadedMedia; error?: string };
      if (!response.ok || !body.asset) throw new Error(body.error || "Attachment upload failed.");
      setUploadedMedia(body.asset);
      setComposerNotice("Attachment verified and ready to send.");
    } catch (uploadError) {
      setUploadedMedia(null);
      setError(uploadError instanceof Error ? uploadError.message : "Attachment upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function sendMessage() {
    if (!selectedId || sending || (!draft.trim() && !uploadedMedia)) return;
    const selectedChannel = selectedSummary
      ? channelOf(selectedSummary)
      : "whatsapp";
    if (selectedChannel === "messenger" && uploadedMedia) {
      setError("Messenger currently supports text replies only.");
      return;
    }
    setSending(true);
    setError(null);
    setComposerNotice(null);
    try {
      const payload = uploadedMedia
        ? {
            kind: "media",
            assetId: uploadedMedia.id,
            mediaType: uploadedMedia.kind,
            caption: draft.trim() || null,
            filename: uploadedMedia.name,
            idempotencyKey: idempotencyKey(),
          }
        : { kind: "text", text: draft.trim(), idempotencyKey: idempotencyKey() };
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(selectedId)}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const body = (await response.json()) as {
        queued?: boolean;
        outboundSent?: boolean;
        dispatchError?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Message could not be sent.");
      setDraft("");
      setUploadedMedia(null);
      const sentChannel = selectedChannel;

      setComposerNotice(
        body.outboundSent
          ? sentChannel === "instagram"
            ? "Message sent through Instagram Messaging API."
            : sentChannel === "messenger"
              ? "Message sent through Facebook Messenger Send API."
              : "Message sent through Meta WhatsApp Cloud API."
          : body.dispatchError
            ? `Message queued, but delivery failed: ${body.dispatchError}`
            : "Message queued. Open Cutover to activate live outbound delivery.",
      );
      await loadConversation(selectedId, true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  const nextActions = useMemo(() => {
    if (!selected?.lead) return ["Capture lead goal and course requirement"];
    const actions: string[] = [];
    if (!selected.lead.occupation) actions.push("Confirm current occupation");
    if (!selected.lead.goal) actions.push("Understand the learner's primary goal");
    if (!selected.lead.interestedCourse) actions.push("Identify the suitable program");
    if (!selected.lead.joiningTimeline) actions.push("Ask joining timeline");
    if (selected.lead.score >= 70 && !selected.lead.counselorRequested) {
      actions.push("Offer a counselor call");
    }
    return actions.length > 0 ? actions : ["No pending qualification question"];
  }, [selected]);

  const navIconFor = (title: string) => title.toLowerCase();

  function renderChannels(variant: "rail" | "chips") {
    return (
      <div className={variant === "rail" ? "sx-channels" : "sx-channels sx-channels-chips"} aria-label="Channels">
        {variant === "rail" ? <p className="sx-side-label">Channels</p> : null}
        <div className="sx-channels-list">
          {CHANNELS.map((channel) => {
            const unread = channelUnread[channel.id];
            const isActive = channelFilter === channel.id;
            return (
              <button
                key={channel.id}
                type="button"
                className={`sx-chan ${isActive ? "is-active" : ""} ${channel.connected ? "" : "is-pending"}`}
                aria-pressed={isActive}
                onClick={() => setChannelFilter(channel.id)}
              >
                <span className="sx-chan-ic"><ChannelGlyph channel={channel.id} /></span>
                <span className="sx-chan-name">{channel.label}</span>
                {channel.connected ? (
                  unread > 0 ? (
                    <span className="sx-chan-count">{unread}</span>
                  ) : (
                    <span className="sx-chan-dot" aria-label="Connected" title="Connected" />
                  )
                ) : (
                  <span className="sx-chan-tag">Connect</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <main
      className={`sx-inbox sx-mv-${mobileView.toLowerCase()} ${mobileDetailsOpen ? "sx-details-open" : ""}`}
    >
      {/* LEFT NAVIGATION — keeps the .rail / nav / .rail-button / .brand-mark hooks intact */}
      <aside className="rail sx-side" aria-label="Primary navigation">
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
          <nav className="sx-nav">
            {NAV_ITEMS.filter(([title]) => PRIMARY_NAV.has(title)).map(([title, href]) => (
              <Link
                key={title}
                className={`rail-button sx-navitem ${title === "Inbox" ? "active is-active" : ""}`}
                title={title}
                aria-label={title}
                aria-current={title === "Inbox" ? "page" : undefined}
                href={href}
              >
                <span className="sx-navic"><Ic name={navIconFor(title)} /></span>
                <span className="sx-navlabel">{title}</span>
                {title === "Inbox" && metrics.unread > 0 ? (
                  <span className="sx-navbadge">{metrics.unread}</span>
                ) : null}
              </Link>
            ))}
          </nav>

          {renderChannels("rail")}

          <div className="sx-side-group">
            <p className="sx-side-label">Manage</p>
            <nav className="sx-nav">
              {NAV_ITEMS.filter(([title]) => !PRIMARY_NAV.has(title)).map(([title, href]) => (
                <Link
                  key={title}
                  className="rail-button sx-navitem"
                  title={title}
                  aria-label={title}
                  href={href}
                >
                  <span className="sx-navic"><Ic name={navIconFor(title)} /></span>
                  <span className="sx-navlabel">{title}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="sx-side-foot">
          <Link className="rail-button sx-navitem" title="Settings" aria-label="Settings" href="/settings">
            <span className="sx-navic"><Ic name="settings" /></span>
            <span className="sx-navlabel">Settings</span>
          </Link>
          <div className="sx-account">
            <span className="sx-acc-avatar">{initials(userName)}</span>
            <span className="sx-acc-copy">
              <strong>{userName}</strong>
              <small>{userRole}</small>
            </span>
            <LogoutButton />
          </div>
        </div>
      </aside>

      <div className="sx-workspace-v22" data-ui-version="22">
      {/* CONVERSATION LIST COLUMN */}
      <section className="sx-list">
        <header className="sx-list-head">
          <div className="sx-list-headtop">
            <div>
              <h1 className="sx-list-title">Unified Inbox</h1>
              <p className="sx-list-sub">
                {conversations.length} conversations ·{" "}
                {scope === "RECENT"
                  ? "last 24 hours · live sync"
                  : "history"}
              </p>
            </div>
            <div className="sx-list-headactions">
              <span className="sx-live"><i />Live</span>
              <button
                className="sx-iconbtn"
                type="button"
                aria-label="Reset conversation filters"
                title="Reset filters"
                onClick={() => { setSearch(""); setFilter("ALL"); }}
              >
                <Ic name="refresh" size={16} />
              </button>
            </div>
          </div>
          <div className="sx-list-status">
            <MetaConnectionStatus />
          </div>
        </header>

        {renderChannels("chips")}

        <div
          className="sx-tabs"
          aria-label="Conversation history scope"
        >
          <button
            type="button"
            className={
              scope === "RECENT"
                ? "is-active"
                : ""
            }
            onClick={() =>
              changeConversationScope(
                "RECENT",
              )
            }
          >
            Last 24 Hours
          </button>

          <button
            type="button"
            className={
              scope === "HISTORY"
                ? "is-active"
                : ""
            }
            onClick={() =>
              changeConversationScope(
                "HISTORY",
              )
            }
          >
            History
          </button>
        </div>

        <label className="sx-search">
          <Ic name="search" size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, number or course"
          />
        </label>

        <div className="sx-tabs">
          <button className={filter === "ALL" ? "is-active" : ""} onClick={() => setFilter("ALL")}>All</button>
          <button className={filter === "UNREAD" ? "is-active" : ""} onClick={() => setFilter("UNREAD")}>Unread</button>
          <button className={filter === "HOT" ? "is-active" : ""} onClick={() => setFilter("HOT")}>Hot leads</button>
        </div>

        <div className="sx-convos">
          {filteredConversations.length === 0 ? (
            activeChannel.connected ? (
              <div className="sx-empty"><strong>No conversations found</strong><p>New {activeChannel.label} messages appear here automatically.</p></div>
            ) : (
              <div className="sx-empty">
                <strong>No {activeChannel.label} conversations yet</strong>
                <p>Connect {activeChannel.label} to bring its chats into this unified inbox.</p>
              </div>
            )
          ) : filteredConversations.map((item) => (
            <button
              key={item.id}
              type="button"
              data-conversation-id={item.id}
              className={`conversation-item sx-convo ${selectedId === item.id ? "selected is-selected" : ""}`}
              onClick={() => {
                setMobileView("CHAT");
                setMobileDetailsOpen(false);
                void loadConversation(item.id);
              }}
            >
              <span className="sx-avatar">
                {initials(item.contact.name)}
                <span className="sx-chanbadge" aria-label={`${CHANNELS.find((c) => c.id === channelOf(item))?.label ?? "WhatsApp"} conversation`}>
                  <ChannelGlyph channel={channelOf(item)} size={14} />
                </span>
              </span>
              <span className="sx-convo-main">
                <span className="sx-convo-top">
                  <strong>{item.contact.name}</strong>
                  <time>{formatListTime(item.lastMessageAt)}</time>
                </span>
                <span className="sx-convo-prev">{messagePreview(item)}</span>
                <span className="sx-convo-meta">
                  <TemperatureBadge value={item.lead?.temperature} />
                  <span className="sx-convo-stage">{readable(item.lead?.stage || item.status)}</span>
                </span>
              </span>
              {item.unreadCount > 0 ? <span className="sx-unread">{item.unreadCount}</span> : null}
            </button>
          ))}
        </div>
      </section>

      {/* CHAT COLUMN */}
      <section className="sx-chat">
        <header className="sx-chat-head">
          {selectedSummary ? (
            <>
              <button
                className="sx-chat-back"
                type="button"
                aria-label="Back to conversations"
                onClick={() => { setMobileDetailsOpen(false); setMobileView("LIST"); }}
              >
                <Ic name="back" />
              </button>
              <div className="sx-chat-person">
                <span className="sx-avatar sx-avatar-lg">
                  {initials(selectedSummary.contact.name)}
                  <span className="sx-chanbadge">
                    <ChannelGlyph channel={channelOf(selectedSummary)} size={16} />
                  </span>
                </span>
                <div className="sx-chat-ident">
                  <h2>{selectedSummary.contact.name}</h2>
                  <p>
                    <span className="sx-chat-chip">
                      <ChannelGlyph channel={channelOf(selectedSummary)} size={12} />
                      {CHANNELS.find((c) => c.id === channelOf(selectedSummary))?.label ?? "WhatsApp"}
                    </span>
                    <span className="sx-chat-phone">{selectedSummary.contact.phone}</span>
                  </p>
                </div>
              </div>
              <div className="sx-chat-actions">
                <button
                  className="sx-lead-btn"
                  type="button"
                  aria-expanded={mobileDetailsOpen}
                  onClick={() => setMobileDetailsOpen(true)}
                >
                  Lead
                </button>
                <label className="sx-switch" title="Toggle AI Agent">
                  <span>{modeUpdating ? "Updating…" : "AI Agent"}</span>
                  <input
                    type="checkbox"
                    checked={selectedSummary.agentMode === "AI"}
                    disabled={modeUpdating}
                    onChange={(event) => void changeMode(event.target.checked ? "AI" : "PAUSED")}
                  />
                  <i />
                </label>
                <button
                  className="sx-btn-outline"
                  type="button"
                  disabled={modeUpdating}
                  onClick={() => void changeMode(selectedSummary.agentMode === "HUMAN" ? "AI" : "HUMAN")}
                >
                  {selectedSummary.agentMode === "HUMAN" ? "Resume AI" : "Take over"}
                </button>
                <button className="sx-iconbtn" type="button" title="More actions" onClick={() => setActionMenuOpen((value) => !value)}>
                  <Ic name="more" />
                </button>
                {actionMenuOpen ? (
                  <div className="sx-menu">
                    <button type="button" onClick={() => selectedId && void markRead(selectedId)}>Mark as read</button>
                    <Link href="/contacts">Open contact manager</Link>
                    <Link href="/leads">Open lead manager</Link>
                    <Link href="/team">Open team assignment</Link>
                    {selectedSummary.status === "RESOLVED" || selectedSummary.status === "CLOSED" ? (
                      <button type="button" disabled={operationBusy} onClick={() => void updateStatus("OPEN")}>Reopen conversation</button>
                    ) : (
                      <button className="sx-menu-danger" type="button" disabled={operationBusy} onClick={() => void updateStatus("RESOLVED")}>Resolve conversation</button>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="sx-chat-person"><div className="sx-chat-ident"><h2>No conversation selected</h2><p>Incoming WhatsApp conversations will be listed on the left.</p></div></div>
          )}
        </header>

        <div className="sx-context">
          <span>Intent · {readable(selected?.currentIntent)}</span>
          <span>Language · {readable(selected?.detectedLanguage)}</span>
          <span>Confidence · {selected?.aiConfidence != null ? `${Math.round(selected.aiConfidence * 100)}%` : "N/A"}</span>
          <span className="sx-context-ok">Mode · {readable(selectedSummary?.agentMode)}</span>
        </div>

        {error ? <div className="sx-error">{error}</div> : null}

        <div className="sx-messages" ref={messageAreaRef}>
          {loadingConversation ? (
            <div className="sx-center">Loading conversation…</div>
          ) : !selected ? (
            <div className="sx-center"><strong>Inbox is ready</strong><p>Incoming messages will update automatically.</p></div>
          ) : selected.messages.length === 0 ? (
            <div className="sx-center">No message has been stored in this conversation.</div>
          ) : (
            <>
              <div className="sx-daydivider"><span>Today</span></div>
              {selected.messages.map((message) => (
                <div key={message.id} className={`sx-msgrow ${message.direction.toLowerCase()}`}>
                  <div className="sx-bubble">
                    {message.direction === "OUTBOUND" ? <small>{message.actor === "AI" ? "AI Agent" : message.actor === "HUMAN" ? "Counselor" : readable(message.actor)}</small> : null}
                    <MessageMedia message={message} />
                    {message.text ? <p>{message.text}</p> : !message.mediaUrl ? <p>[{readable(message.type)} message]</p> : null}
                    <time>{formatMessageTime(message.messageTimestamp)} · {readable(message.status)}</time>
                  </div>
                </div>
              ))}
            </>
          )}

          {selected?.aiSummary || selected?.currentIntent ? (
            <div className="sx-agentnote">
              <span className="sx-agentnote-dot" />
              <div><strong>Agent context</strong><p>{selected.aiSummary || `Current detected intent: ${readable(selected.currentIntent)}.`}</p></div>
              <button type="button" onClick={() => window.location.assign("/knowledge")}>Review</button>
            </div>
          ) : null}
        </div>

        <footer className="sx-composer">
          <input
            ref={fileInputRef}
            className="sx-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain,video/mp4,audio/mpeg,audio/mp4,audio/ogg,audio/aac"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }}
          />
          {uploadedMedia ? (
            <div className="sx-composer-media">
              {uploadedMedia.kind === "image" ? <img src={uploadedMedia.previewUrl} alt="Attachment preview" /> : <span className="sx-composer-mediatype">{uploadedMedia.kind.toUpperCase()}</span>}
              <div><strong>{uploadedMedia.name}</strong><small>{formatBytes(uploadedMedia.size)} · {uploadedMedia.mimeType}</small></div>
              <button type="button" onClick={() => setUploadedMedia(null)} aria-label="Remove attachment"><Ic name="x" size={15} /></button>
            </div>
          ) : null}
          {composerNotice ? <div className="sx-composer-note">{composerNotice}</div> : null}
          <div className="sx-composer-channel-note">
            {selectedSummary && channelOf(selectedSummary) === "instagram"
              ? "Messages are sent through Instagram Messaging API."
              : selectedSummary && channelOf(selectedSummary) === "messenger"
                ? "Text replies are sent through Facebook Messenger Send API. Attachments are not enabled yet."
                : "Messages are sent through Meta WhatsApp Cloud API."}
          </div>
          <div className="sx-composer-row">
            <button className="sx-composer-tool" type="button" disabled={!selected || uploading || sending || (selectedSummary ? channelOf(selectedSummary) === "messenger" : false)} aria-label="Attach file" title="Attach image, PDF, document, video, or audio" onClick={() => fileInputRef.current?.click()}>
              {uploading ? <span className="sx-spin">…</span> : <Ic name="paperclip" />}
            </button>
            <textarea
              aria-label="Message draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={uploadedMedia ? "Add an optional caption…" : "Write a message…"}
              rows={1}
              disabled={!selected || sending}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
            />
            <div className="sx-composer-tools">
              <button className="sx-composer-tool" type="button" aria-label="Open templates and targeted campaigns" title="Open templates and targeted campaigns">
                <Ic name="grid" />
              </button>
              <button className="sx-composer-tool" type="button" aria-label="Open Template Centre" title="Open Template Centre" onClick={() => window.location.assign("/templates")}>
                <Ic name="sparkle" />
              </button>
            </div>
            <span className="sx-composer-divider" aria-hidden="true" />
            <button
              className="sx-send"
              type="button"
              aria-label="Send message"
              disabled={
                !selected ||
                sending ||
                uploading ||
                (!draft.trim() && !uploadedMedia) ||
                Boolean(
                  selectedSummary &&
                    channelOf(selectedSummary) === "messenger" &&
                    uploadedMedia,
                )
              }
              title={
                selectedSummary && channelOf(selectedSummary) === "instagram"
                  ? "Send through Instagram Messaging API"
                  : selectedSummary && channelOf(selectedSummary) === "messenger"
                    ? "Send text through Facebook Messenger Send API"
                    : "Send through Meta WhatsApp Cloud API"
              }
              onClick={() => void sendMessage()}
            >
              {sending ? <span className="sx-spin">…</span> : <Ic name="send" size={19} />}
            </button>
          </div>
        </footer>
      </section>

      {/* DETAILS COLUMN / SLIDE-OVER */}
      <button
        className="sx-details-backdrop"
        type="button"
        aria-label="Close lead intelligence"
        onClick={() => setMobileDetailsOpen(false)}
      />
      <aside className="sx-details">
        <button
          className="sx-details-close"
          type="button"
          aria-label="Close lead intelligence"
          onClick={() => setMobileDetailsOpen(false)}
        >
          <Ic name="x" size={16} />
        </button>
        {selectedSummary ? (
          <>
            <div className="sx-profile">
              <span className="sx-avatar sx-avatar-xl">
                {initials(selectedSummary.contact.name)}
                <span className="sx-chanbadge">
                  <ChannelGlyph channel={channelOf(selectedSummary)} size={18} />
                </span>
              </span>
              <h2>{selectedSummary.contact.name}</h2>
              <p className="sx-profile-handle">{selectedSummary.contact.phone}</p>
              <TemperatureBadge value={selectedSummary.lead?.temperature} />
            </div>

            <div className="sx-ai-summary">
              <div className="sx-ai-summary-head"><Ic name="sparkle" size={15} /> AI Summary</div>
              <p>{selected?.aiSummary || "No AI summary is available yet. It is generated automatically as the conversation develops."}</p>
              <button type="button" className="sx-ai-summary-edit" onClick={() => window.location.assign("/leads")}>Edit in lead manager</button>
            </div>

            <div
              className="sx-score"
              style={{ ["--sx-score" as string]: `${selectedSummary.lead?.score ?? 0}` }}
            >
              <div className="sx-score-topline">
                <div className="sx-score-value">
                  <strong>{selectedSummary.lead?.score ?? 0}</strong>
                  <span>/ 100</span>
                </div>
                <span className="sx-score-percent">{selectedSummary.lead?.score ?? 0}%</span>
              </div>
              <div
                className="sx-score-meter"
                aria-label={`Qualification score ${selectedSummary.lead?.score ?? 0} out of 100`}
              >
                <span className="sx-score-fill" />
                <span className="sx-score-knob" />
              </div>
              <div className="sx-score-range" aria-hidden="true">
                <span>1</span>
                <span>100</span>
              </div>
              <div className="sx-score-copy">
                <strong>Qualification score</strong>
                <p>Calculated from captured profile and joining intent.</p>
              </div>
            </div>

            <section className="sx-detail-block">
              <h3>Lead profile</h3>
              <dl className="sx-detail-list">
                <div><dt>Course</dt><dd>{readable(selectedSummary.lead?.interestedCourse)}</dd></div>
                <div><dt>City</dt><dd>{readable(selectedSummary.contact.city)}</dd></div>
                <div><dt>Occupation</dt><dd>{readable(selectedSummary.lead?.occupation)}</dd></div>
                <div><dt>Experience</dt><dd>{readable(selectedSummary.lead?.experienceLevel)}</dd></div>
                <div><dt>Joining</dt><dd>{readable(selectedSummary.lead?.joiningTimeline)}</dd></div>
                <div><dt>Source</dt><dd>{readable(selected?.source)}</dd></div>
                <div><dt>Stage</dt><dd>{readable(selectedSummary.lead?.stage || selectedSummary.status)}</dd></div>
                <div><dt>Owner</dt><dd>{selectedSummary.assignee?.name || "Unassigned"}</dd></div>
              </dl>
            </section>

            <section className="sx-detail-block">
              <h3>Next actions</h3>
              <div className="sx-actions">
                {nextActions.map((action) => (
                  <label className="sx-action" key={action}>
                    <input
                      type="checkbox"
                      disabled={action === "No pending qualification question"}
                      onChange={() => setDraft(suggestedReply(action))}
                    />
                    <span>{action}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="sx-learning">
              <span className="sx-learning-tag">Controlled learning</span>
              <strong>No raw chat is auto-trained</strong>
              <p>Counselor corrections enter an approval queue before becoming reusable knowledge.</p>
              <button type="button" onClick={() => window.location.assign("/knowledge")}>Open learning queue</button>
            </section>
          </>
        ) : (
          <div className="sx-empty"><strong>No lead selected</strong><p>Select a conversation to view qualification and agent context.</p></div>
        )}
      </aside>
      </div>
    </main>
  );
}
