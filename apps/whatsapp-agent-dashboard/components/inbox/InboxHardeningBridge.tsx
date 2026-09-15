"use client";

import { useEffect } from "react";

type ChannelSlug =
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

const CHANNEL_SLUGS: Record<string, ChannelSlug> = {
  WhatsApp: "whatsapp",
  Instagram: "instagram",
  Messenger: "messenger",
  Telegram: "telegram",
  LinkedIn: "linkedin",
  "X / Twitter": "twitter",
  Email: "email",
  "Website Chat": "website",
  SMS: "sms",
  "Contact Form": "contact-form",
};

const SWITCH_SETTLE_GRACE_MS = 120;
const SWITCH_TIMEOUT_MS = 8_000;
const SWITCH_CHECK_MS = 60;
const DETAILS_COMPOSER_Z_INDEX = "40";

function channelLabel(button: HTMLElement): string {
  return button.querySelector<HTMLElement>(".sx-chan-name")?.textContent?.trim() || "Channel";
}

function conversationButtons(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(".sx-convos .sx-convo"));
}

function selectedConversationButton(root: HTMLElement): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(".sx-convos .sx-convo.is-selected");
}

function findConversationButton(root: HTMLElement, conversationId: string): HTMLButtonElement | null {
  return conversationButtons(root).find((button) => button.dataset.conversationId === conversationId) ?? null;
}

function setImportantIfChanged(element: HTMLElement, property: string, value: string): void {
  if (
    element.style.getPropertyValue(property) === value &&
    element.style.getPropertyPriority(property) === "important"
  ) {
    return;
  }
  element.style.setProperty(property, value, "important");
}

function setChannelGuard(root: HTMLElement, enabled: boolean, label = "Channel"): void {
  const chat = root.querySelector<HTMLElement>(".sx-chat");
  if (!chat) return;

  let banner = chat.querySelector<HTMLElement>(":scope > .sx-hardening-channel-guard");
  if (enabled) {
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "sx-hardening-channel-guard";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      chat.appendChild(banner);
    }
    banner.textContent = `No ${label} conversation is selected. Choose a conversation from the list.`;
    root.dataset.inboxChannelGuard = "true";

    chat.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>(
      ".sx-composer button, .sx-composer input, .sx-composer textarea",
    ).forEach((control) => {
      if (!control.disabled) {
        control.dataset.inboxHardeningDisabled = "true";
        control.disabled = true;
      }
    });
    return;
  }

  delete root.dataset.inboxChannelGuard;
  banner?.remove();
  chat.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>(
    '[data-inbox-hardening-disabled="true"]',
  ).forEach((control) => {
    control.disabled = false;
    delete control.dataset.inboxHardeningDisabled;
  });
}

export default function InboxHardeningBridge() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".sx-inbox");
    if (!root) return;

    let switchLocked = false;
    let switchStartedAt = 0;
    let queuedConversationId: string | null = null;
    let settleTimer = 0;
    let syncFrame = 0;
    let stackingFrame = 0;
    let savedComposerZIndex: { value: string; priority: string } | null = null;
    let savedComposerPointerEvents: { value: string; priority: string } | null = null;

    function releaseSwitchLock(): void {
      switchLocked = false;
      delete root.dataset.inboxSwitching;
      if (settleTimer) {
        window.clearTimeout(settleTimer);
        settleTimer = 0;
      }

      const queuedId = queuedConversationId;
      queuedConversationId = null;
      if (!queuedId) return;

      const queued = findConversationButton(root, queuedId);
      if (queued && !queued.classList.contains("is-selected")) {
        window.requestAnimationFrame(() => queued.click());
      }
    }

    function recoverFromHungSwitch(): void {
      const targetId =
        queuedConversationId ||
        selectedConversationButton(root)?.dataset.conversationId ||
        null;

      if (targetId) {
        window.location.assign(`/inbox?conversation=${encodeURIComponent(targetId)}`);
        return;
      }

      window.location.reload();
    }

    function watchSwitchSettlement(): void {
      if (settleTimer) window.clearTimeout(settleTimer);

      const check = () => {
        settleTimer = 0;
        if (!switchLocked) return;

        const elapsed = performance.now() - switchStartedAt;
        const loadingText = root.querySelector<HTMLElement>(".sx-messages .sx-center")?.textContent || "";
        const loading = loadingText.includes("Loading conversation");

        if (!loading && elapsed >= SWITCH_SETTLE_GRACE_MS) {
          releaseSwitchLock();
          return;
        }

        if (loading && elapsed >= SWITCH_TIMEOUT_MS) {
          recoverFromHungSwitch();
          return;
        }

        settleTimer = window.setTimeout(check, SWITCH_CHECK_MS);
      };

      settleTimer = window.setTimeout(check, SWITCH_CHECK_MS);
    }

    function queueChannelSync(label: string, reason: "initial" | "user"): void {
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = window.requestAnimationFrame(() => {
          syncFrame = 0;
          const buttons = conversationButtons(root);
          const selected = selectedConversationButton(root);

          if (selected) {
            setChannelGuard(root, false);
            return;
          }

          if (buttons.length === 0) {
            setChannelGuard(root, true, label);
            return;
          }

          setChannelGuard(root, false);

          const isMobileList = window.innerWidth <= 767 && root.classList.contains("sx-mv-list");
          if (reason === "user" && isMobileList) {
            return;
          }

          buttons[0]?.click();
        });
      });
    }

    function applyDetailsStacking(): void {
      stackingFrame = 0;
      const composer = root.querySelector<HTMLElement>(".sx-composer");
      if (!composer) return;

      const detailsOpen = root.classList.contains("sx-details-open");
      if (detailsOpen) {
        if (!savedComposerZIndex) {
          savedComposerZIndex = {
            value: composer.style.getPropertyValue("z-index"),
            priority: composer.style.getPropertyPriority("z-index"),
          };
        }
        if (!savedComposerPointerEvents) {
          savedComposerPointerEvents = {
            value: composer.style.getPropertyValue("pointer-events"),
            priority: composer.style.getPropertyPriority("pointer-events"),
          };
        }
        setImportantIfChanged(composer, "z-index", DETAILS_COMPOSER_Z_INDEX);
        setImportantIfChanged(composer, "pointer-events", "none");
        if (composer.getAttribute("aria-hidden") !== "true") {
          composer.setAttribute("aria-hidden", "true");
        }
        return;
      }

      if (savedComposerZIndex) {
        if (savedComposerZIndex.value) {
          composer.style.setProperty("z-index", savedComposerZIndex.value, savedComposerZIndex.priority);
        } else {
          composer.style.removeProperty("z-index");
        }
        savedComposerZIndex = null;
      }

      if (savedComposerPointerEvents) {
        if (savedComposerPointerEvents.value) {
          composer.style.setProperty(
            "pointer-events",
            savedComposerPointerEvents.value,
            savedComposerPointerEvents.priority,
          );
        } else {
          composer.style.removeProperty("pointer-events");
        }
        savedComposerPointerEvents = null;
      }
      composer.removeAttribute("aria-hidden");
    }

    function scheduleDetailsStacking(): void {
      if (stackingFrame) return;
      stackingFrame = window.requestAnimationFrame(() => {
        stackingFrame = window.requestAnimationFrame(applyDetailsStacking);
      });
    }

    function handleClick(event: MouseEvent): void {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const channel = target.closest<HTMLElement>(".sx-chan");
      if (channel && root.contains(channel)) {
        const label = channelLabel(channel);
        if (channel.classList.contains("is-pending")) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          const slug = CHANNEL_SLUGS[label] || "whatsapp";
          window.location.assign(`/integrations?channel=${encodeURIComponent(slug)}`);
          return;
        }

        queueChannelSync(label, "user");
        return;
      }

      const conversation = target.closest<HTMLButtonElement>(".sx-convo");
      if (!conversation || !root.contains(conversation) || conversation.classList.contains("is-selected")) {
        return;
      }

      const conversationId = conversation.dataset.conversationId;
      if (!conversationId) return;

      if (switchLocked) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        queuedConversationId = conversationId;
        return;
      }

      switchLocked = true;
      switchStartedAt = performance.now();
      queuedConversationId = null;
      root.dataset.inboxSwitching = "true";
      setChannelGuard(root, false);
      watchSwitchSettlement();
    }

    const mutationObserver = new MutationObserver((mutations) => {
      const detailsMayHaveChanged = mutations.some((mutation) => {
        if (mutation.type !== "attributes") return false;
        const element = mutation.target instanceof HTMLElement ? mutation.target : null;
        return Boolean(
          element &&
          (element === root || element.classList.contains("sx-composer")) &&
          (mutation.attributeName === "class" || mutation.attributeName === "style"),
        );
      });

      if (detailsMayHaveChanged) scheduleDetailsStacking();
    });

    document.addEventListener("click", handleClick, true);
    mutationObserver.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    window.addEventListener("resize", scheduleDetailsStacking, { passive: true });
    window.addEventListener("orientationchange", scheduleDetailsStacking, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleDetailsStacking, { passive: true });

    const activeChannel = root.querySelector<HTMLElement>(".sx-chan.is-active");
    queueChannelSync(activeChannel ? channelLabel(activeChannel) : "WhatsApp", "initial");
    scheduleDetailsStacking();

    return () => {
      document.removeEventListener("click", handleClick, true);
      mutationObserver.disconnect();
      window.removeEventListener("resize", scheduleDetailsStacking);
      window.removeEventListener("orientationchange", scheduleDetailsStacking);
      window.visualViewport?.removeEventListener("resize", scheduleDetailsStacking);
      if (settleTimer) window.clearTimeout(settleTimer);
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      if (stackingFrame) window.cancelAnimationFrame(stackingFrame);
      setChannelGuard(root, false);
    };
  }, []);

  return null;
}
