"use client";

import { useEffect } from "react";

import {
  getInboxComposerDockLayout,
  INBOX_COMPOSER_DOCK_Z_INDEX,
} from "./inbox-composer-dock-layout";

function setImportant(element: HTMLElement, property: string, value: string): void {
  element.style.setProperty(property, value, "important");
}

function restoreInlineStyle(
  element: HTMLElement | null,
  originalStyle: string | null,
): void {
  if (!element) return;
  if (originalStyle === null) element.removeAttribute("style");
  else element.setAttribute("style", originalStyle);
}

export default function InboxComposerDockBridge() {
  useEffect(() => {
    let frame = 0;
    let currentChat: HTMLElement | null = null;
    let currentComposer: HTMLElement | null = null;
    let currentMessages: HTMLElement | null = null;
    let currentInbox: HTMLElement | null = null;
    let currentRow: HTMLElement | null = null;
    let currentTextarea: HTMLTextAreaElement | null = null;
    let currentChannelNote: HTMLElement | null = null;
    let currentTools: HTMLElement | null = null;
    let currentDivider: HTMLElement | null = null;
    let currentMobileNav: HTMLElement | null = null;
    let chatOriginalStyle: string | null = null;
    let composerOriginalStyle: string | null = null;
    let messagesOriginalStyle: string | null = null;
    let inboxOriginalStyle: string | null = null;
    let rowOriginalStyle: string | null = null;
    let textareaOriginalStyle: string | null = null;
    let channelNoteOriginalStyle: string | null = null;
    let toolsOriginalStyle: string | null = null;
    let dividerOriginalStyle: string | null = null;

    const resizeObserver = new ResizeObserver(() => schedule());

    function restoreCurrent(): void {
      resizeObserver.disconnect();

      restoreInlineStyle(currentRow, rowOriginalStyle);
      restoreInlineStyle(currentTextarea, textareaOriginalStyle);
      restoreInlineStyle(currentChannelNote, channelNoteOriginalStyle);
      restoreInlineStyle(currentTools, toolsOriginalStyle);
      restoreInlineStyle(currentDivider, dividerOriginalStyle);
      restoreInlineStyle(currentComposer, composerOriginalStyle);
      restoreInlineStyle(currentChat, chatOriginalStyle);
      restoreInlineStyle(currentMessages, messagesOriginalStyle);
      restoreInlineStyle(currentInbox, inboxOriginalStyle);

      currentComposer?.removeAttribute("data-runtime-docked");
      currentComposer?.removeAttribute("data-runtime-bottom-inset");

      currentChat = null;
      currentComposer = null;
      currentMessages = null;
      currentInbox = null;
      currentRow = null;
      currentTextarea = null;
      currentChannelNote = null;
      currentTools = null;
      currentDivider = null;
      currentMobileNav = null;
      chatOriginalStyle = null;
      composerOriginalStyle = null;
      messagesOriginalStyle = null;
      inboxOriginalStyle = null;
      rowOriginalStyle = null;
      textareaOriginalStyle = null;
      channelNoteOriginalStyle = null;
      toolsOriginalStyle = null;
      dividerOriginalStyle = null;
    }

    function rememberNodes(
      inbox: HTMLElement,
      chat: HTMLElement,
      composer: HTMLElement,
      messages: HTMLElement | null,
      row: HTMLElement | null,
      textarea: HTMLTextAreaElement | null,
      channelNote: HTMLElement | null,
      tools: HTMLElement | null,
      divider: HTMLElement | null,
      mobileNav: HTMLElement | null,
    ): void {
      if (
        currentInbox === inbox &&
        currentChat === chat &&
        currentComposer === composer &&
        currentMessages === messages &&
        currentRow === row &&
        currentTextarea === textarea &&
        currentChannelNote === channelNote &&
        currentTools === tools &&
        currentDivider === divider &&
        currentMobileNav === mobileNav
      ) {
        return;
      }

      restoreCurrent();
      currentInbox = inbox;
      currentChat = chat;
      currentComposer = composer;
      currentMessages = messages;
      currentRow = row;
      currentTextarea = textarea;
      currentChannelNote = channelNote;
      currentTools = tools;
      currentDivider = divider;
      currentMobileNav = mobileNav;
      inboxOriginalStyle = inbox.getAttribute("style");
      chatOriginalStyle = chat.getAttribute("style");
      composerOriginalStyle = composer.getAttribute("style");
      messagesOriginalStyle = messages?.getAttribute("style") ?? null;
      rowOriginalStyle = row?.getAttribute("style") ?? null;
      textareaOriginalStyle = textarea?.getAttribute("style") ?? null;
      channelNoteOriginalStyle = channelNote?.getAttribute("style") ?? null;
      toolsOriginalStyle = tools?.getAttribute("style") ?? null;
      dividerOriginalStyle = divider?.getAttribute("style") ?? null;
      resizeObserver.observe(chat);
      resizeObserver.observe(composer);
      if (mobileNav) resizeObserver.observe(mobileNav);
    }

    function shouldDock(): boolean {
      const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const touchDevice = navigator.maxTouchPoints > 0;
      return coarsePointer || touchDevice || window.innerWidth <= 1199;
    }

    function getVisibleMobileNavInset(
      inbox: HTMLElement,
      viewportTop: number,
      viewportHeight: number,
    ): { element: HTMLElement | null; inset: number } {
      if (window.innerWidth > 767) {
        return { element: null, inset: 0 };
      }

      const mobileNav = inbox.querySelector<HTMLElement>(":scope > .sx-side");
      if (!mobileNav) return { element: null, inset: 0 };

      const style = window.getComputedStyle(mobileNav);
      if (style.display === "none" || style.visibility === "hidden") {
        return { element: mobileNav, inset: 0 };
      }

      const navRect = mobileNav.getBoundingClientRect();
      const viewportBottom = viewportTop + viewportHeight;
      const overlapsVisibleBottom =
        navRect.width > 1 &&
        navRect.height > 1 &&
        navRect.top < viewportBottom &&
        navRect.bottom > viewportTop &&
        navRect.bottom >= viewportBottom - 2;

      return {
        element: mobileNav,
        inset: overlapsVisibleBottom
          ? Math.max(0, Math.min(navRect.height, viewportBottom - navRect.top))
          : 0,
      };
    }

    function applyDock(): void {
      frame = 0;

      const inbox = document.querySelector<HTMLElement>(".sx-inbox");
      const chat = inbox?.querySelector<HTMLElement>(".sx-chat") ?? null;
      const composer = chat?.querySelector<HTMLElement>(".sx-composer") ?? null;
      const messages = chat?.querySelector<HTMLElement>(".sx-messages") ?? null;
      const row = composer?.querySelector<HTMLElement>(".sx-composer-row") ?? null;
      const textarea = composer?.querySelector<HTMLTextAreaElement>("textarea") ?? null;
      const channelNote =
        composer?.querySelector<HTMLElement>(".sx-composer-channel-note") ?? null;
      const tools = composer?.querySelector<HTMLElement>(".sx-composer-tools") ?? null;
      const divider =
        composer?.querySelector<HTMLElement>(".sx-composer-divider") ?? null;

      if (!inbox || !chat || !composer || !shouldDock()) {
        restoreCurrent();
        return;
      }

      const chatStyle = window.getComputedStyle(chat);
      const rect = chat.getBoundingClientRect();
      const visualViewport = window.visualViewport;
      const viewportWidth = visualViewport?.width ?? window.innerWidth;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportLeft = visualViewport?.offsetLeft ?? 0;
      const viewportRight = viewportLeft + viewportWidth;
      const { element: mobileNav, inset: mobileNavInset } =
        getVisibleMobileNavInset(inbox, viewportTop, viewportHeight);

      rememberNodes(
        inbox,
        chat,
        composer,
        messages,
        row,
        textarea,
        channelNote,
        tools,
        divider,
        mobileNav,
      );

      if (
        chatStyle.display === "none" ||
        rect.width < 2 ||
        rect.height < 2 ||
        rect.right <= viewportLeft ||
        rect.left >= viewportRight
      ) {
        setImportant(composer, "display", "none");
        return;
      }

      const visibleLeft = Math.max(viewportLeft, rect.left);
      const visibleRight = Math.min(viewportRight, rect.right);
      const visibleWidth = Math.max(0, visibleRight - visibleLeft);
      const browserBottomInset = Math.max(
        0,
        window.innerHeight - (viewportTop + viewportHeight),
      );
      const effectiveBottomInset = browserBottomInset + mobileNavInset;
      const layout = getInboxComposerDockLayout(visibleWidth);

      restoreInlineStyle(row, rowOriginalStyle);
      restoreInlineStyle(textarea, textareaOriginalStyle);
      restoreInlineStyle(channelNote, channelNoteOriginalStyle);
      restoreInlineStyle(tools, toolsOriginalStyle);
      restoreInlineStyle(divider, dividerOriginalStyle);

      setImportant(inbox, "transform", "none");
      setImportant(inbox, "filter", "none");
      setImportant(inbox, "perspective", "none");
      setImportant(inbox, "contain", "none");
      setImportant(chat, "transform", "none");
      setImportant(chat, "filter", "none");
      setImportant(chat, "perspective", "none");
      setImportant(chat, "contain", "none");

      setImportant(composer, "position", "fixed");
      setImportant(composer, "left", `${visibleLeft}px`);
      setImportant(composer, "right", "auto");
      setImportant(composer, "bottom", `${effectiveBottomInset}px`);
      setImportant(composer, "top", "auto");
      setImportant(composer, "width", `${visibleWidth}px`);
      setImportant(composer, "max-width", `${visibleWidth}px`);
      setImportant(composer, "min-width", "0");
      setImportant(composer, "min-height", "64px");
      setImportant(
        composer,
        "max-height",
        `${Math.max(120, Math.min(320, viewportHeight * 0.5))}px`,
      );
      setImportant(composer, "display", "block");
      setImportant(composer, "visibility", "visible");
      setImportant(composer, "opacity", "1");
      setImportant(composer, "transform", "none");
      setImportant(composer, "overflow-x", "hidden");
      setImportant(composer, "overflow-y", "auto");
      setImportant(composer, "z-index", String(INBOX_COMPOSER_DOCK_Z_INDEX));
      setImportant(composer, "background", "#ffffff");
      setImportant(
        composer,
        "box-shadow",
        "0 -10px 28px rgba(15, 23, 42, 0.16)",
      );
      composer.setAttribute("data-runtime-docked", "true");
      composer.setAttribute(
        "data-runtime-bottom-inset",
        String(Math.round(effectiveBottomInset)),
      );

      if (row) {
        setImportant(row, "display", "grid");
        setImportant(row, "grid-template-columns", layout.rowTemplate);
        setImportant(row, "width", "100%");
        setImportant(row, "min-width", "0");
      }
      if (textarea) {
        setImportant(textarea, "display", "block");
        setImportant(textarea, "visibility", "visible");
        setImportant(textarea, "opacity", "1");
        setImportant(textarea, "width", "100%");
        setImportant(textarea, "min-width", "0");
        setImportant(textarea, "min-height", "44px");
        setImportant(textarea, "font-size", "16px");
      }

      if (layout.compact) {
        if (channelNote) setImportant(channelNote, "display", "none");
        if (tools) setImportant(tools, "display", "none");
        if (divider) setImportant(divider, "display", "none");
      }

      const composerHeight = Math.max(
        64,
        composer.getBoundingClientRect().height,
      );
      setImportant(
        chat,
        "padding-bottom",
        `${composerHeight + mobileNavInset}px`,
      );
      if (messages) {
        setImportant(messages, "padding-bottom", "16px");
        setImportant(messages, "overflow-y", "auto");
        setImportant(messages, "min-height", "0");
      }
    }

    function schedule(): void {
      if (frame) return;
      frame = window.requestAnimationFrame(applyDock);
    }

    const mutationObserver = new MutationObserver(() => schedule());
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    window.addEventListener("scroll", schedule, {
      passive: true,
      capture: true,
    });
    window.visualViewport?.addEventListener("resize", schedule, {
      passive: true,
    });
    window.visualViewport?.addEventListener("scroll", schedule, {
      passive: true,
    });

    schedule();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      restoreCurrent();
    };
  }, []);

  return null;
}
