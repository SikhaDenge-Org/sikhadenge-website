"use client";

import { useEffect } from "react";

const SEARCH_SELECTOR = [
  'input[type="search"]',
  'input[placeholder^="Search"]',
  '.sx-search input',
  '.sx-conversation-search input',
].join(", ");

export default function CoreWorkflowShortcuts() {
  useEffect(() => {
    const search = document.querySelector<HTMLInputElement>(SEARCH_SELECTOR);
    if (search) {
      search.setAttribute("aria-keyshortcuts", "Control+K Meta+K /");
      if (!search.getAttribute("aria-label")) {
        search.setAttribute("aria-label", "Search this workspace");
      }
    }

    function focusSearch() {
      const target = document.querySelector<HTMLInputElement>(SEARCH_SELECTOR);
      if (!target || target.disabled || target.offsetParent === null) return;
      target.focus({ preventScroll: false });
      target.select();
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (event.key === "Escape" && isTyping && target instanceof HTMLElement) {
        target.blur();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <span className="sx-core-shortcut-hint" aria-hidden="true">
      <kbd>Ctrl</kbd>
      <span>+</span>
      <kbd>K</kbd>
      <span>Search</span>
    </span>
  );
}
