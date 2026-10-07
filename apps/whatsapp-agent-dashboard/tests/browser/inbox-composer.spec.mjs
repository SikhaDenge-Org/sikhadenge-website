import { expect, test } from "@playwright/test";

const ADMIN_EMAIL =
  process.env.DASHBOARD_ADMIN_EMAIL || "admin@example.invalid";
const ADMIN_PASSWORD =
  process.env.DASHBOARD_ADMIN_PASSWORD || "CI-only-password-12345";

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("Work Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/inbox(?:\?|$)/);
  await expect(page.locator(".sx-inbox")).toBeVisible();
  await expect(page.locator(".conversation-item.selected")).toHaveCount(1);
  await expect(page.locator(".sx-chat")).toBeVisible();
}

async function ensureConversationOpen(page) {
  const chat = page.locator(".sx-chat");
  if (await chat.isVisible()) return;

  const selectedConversation = page.locator(".conversation-item.selected");
  await expect(selectedConversation).toHaveCount(1);
  await selectedConversation.dispatchEvent("click");
  await expect(chat).toBeVisible();
}

async function waitForDock(page) {
  await expect
    .poll(() =>
      page
        .locator(".sx-composer")
        .getAttribute("data-runtime-docked"),
    )
    .toBe("true");
  await expect(page.locator(".sx-composer")).toBeVisible();
}

async function visibleChatWidth(page) {
  return page.locator(".sx-chat").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
    return Math.max(0, Math.min(viewportRight, rect.right) - Math.max(viewportLeft, rect.left));
  });
}

test("template dialog stays above the docked tablet composer", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 760 });
  await login(page);
  await ensureConversationOpen(page);
  await waitForDock(page);

  const templateButton = page.getByTitle(
    "Open templates and targeted campaigns",
  );
  await expect(templateButton).toHaveCount(1);

  // Compact tablet layouts intentionally hide secondary tools. Dispatching the
  // real bubbling click still exercises the production document-level bridge,
  // modal, stacking context, and action-area hit testing.
  await templateButton.dispatchEvent("click");

  const overlay = page.locator(".inbox-template-overlay");
  const dialog = page.getByRole("dialog", { name: "Send approved template" });
  const queueButton = page.getByRole("button", { name: "Queue template" });

  await expect(overlay).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(queueButton).toBeVisible();
  await queueButton.scrollIntoViewIfNeeded();

  const stacking = await page.evaluate(() => {
    const composer = document.querySelector(".sx-composer");
    const modal = document.querySelector(".inbox-template-overlay");
    if (!(composer instanceof HTMLElement) || !(modal instanceof HTMLElement)) {
      throw new Error("Composer or template overlay was not rendered.");
    }
    return {
      composer: Number.parseInt(getComputedStyle(composer).zIndex, 10),
      modal: Number.parseInt(getComputedStyle(modal).zIndex, 10),
    };
  });

  expect(stacking.composer).toBeLessThan(stacking.modal);
  await queueButton.click({ trial: true });
});

test("compact controls return after a touch viewport widens", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 680, height: 760 },
    hasTouch: true,
  });
  const page = await context.newPage();

  try {
    await login(page);
    await ensureConversationOpen(page);
    await waitForDock(page);

    const channelNote = page.locator(".sx-composer-channel-note");
    const tools = page.locator(".sx-composer-tools");
    const divider = page.locator(".sx-composer-divider");

    await expect.poll(() => visibleChatWidth(page)).toBeLessThan(720);
    await expect.poll(() => channelNote.evaluate((node) => getComputedStyle(node).display)).toBe("none");
    await expect.poll(() => tools.evaluate((node) => getComputedStyle(node).display)).toBe("none");
    await expect.poll(() => divider.evaluate((node) => getComputedStyle(node).display)).toBe("none");

    // Touch/coarse-pointer devices keep the runtime dock enabled even when a
    // browser is switched into a very wide desktop-mode viewport. This width
    // crosses the real chat-column breakpoint after the details panel opens.
    await page.setViewportSize({ width: 1920, height: 1080 });

    await expect.poll(() => visibleChatWidth(page)).toBeGreaterThanOrEqual(720);
    await waitForDock(page);
    await expect
      .poll(() => channelNote.evaluate((node) => getComputedStyle(node).display))
      .not.toBe("none");
    await expect
      .poll(() => tools.evaluate((node) => getComputedStyle(node).display))
      .not.toBe("none");
    await expect
      .poll(() => divider.evaluate((node) => getComputedStyle(node).display))
      .not.toBe("none");
  } finally {
    await context.close();
  }
});

test("composer remains visible on mobile, tablet, and desktop", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 760, docked: true },
    { width: 1024, height: 760, docked: true },
    { width: 1366, height: 900, docked: false },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);
    await ensureConversationOpen(page);

    const composer = page.locator(".sx-composer");
    await expect(composer).toBeVisible();

    if (viewport.docked) {
      await waitForDock(page);
    } else {
      await expect
        .poll(() => composer.getAttribute("data-runtime-docked"))
        .toBeNull();
    }

    const geometry = await composer.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.visualViewport?.height || window.innerHeight,
      };
    });

    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);

    await page.context().clearCookies();
  }
});
