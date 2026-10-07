import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.DASHBOARD_ADMIN_EMAIL || "admin@example.invalid";
const ADMIN_PASSWORD = process.env.DASHBOARD_ADMIN_PASSWORD || "CI-only-password-12345";

async function login(page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Work Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/inbox(?:\?|$)/);
  await expect(page.locator(".sx-inbox")).toBeVisible();
}

async function ensureConversationSelected(page) {
  const leadButton = page.locator(".sx-lead-btn");
  if (await leadButton.count()) return;

  const firstConversation = page.locator(".sx-convo").first();
  await expect(firstConversation).toBeVisible();
  await firstConversation.click();
  await expect(page.locator(".sx-chat-head")).toBeVisible();
}

async function attachShot(page, testInfo, name) {
  const body = await page.screenshot({ fullPage: false });
  await testInfo.attach(name, { body, contentType: "image/png" });
}

async function panelGeometry(page) {
  return page.locator(".sx-details").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      visibility: style.visibility,
      pointerEvents: style.pointerEvents,
      opacity: Number.parseFloat(style.opacity),
      overflowY: style.overflowY,
    };
  });
}

async function expectPanelSettledInsideViewport(page) {
  await expect.poll(async () => {
    const g = await panelGeometry(page);
    return (
      g.left >= -1 &&
      g.right <= g.viewportWidth + 1 &&
      g.top >= -1 &&
      g.bottom <= g.viewportHeight + 1 &&
      g.visibility === "visible" &&
      g.pointerEvents === "auto" &&
      g.opacity > 0.99
    );
  }, { timeout: 3000 }).toBe(true);
}

async function expectPanelScrollable(page) {
  await expect.poll(async () => {
    const { overflowY } = await panelGeometry(page);
    return overflowY === "auto" || overflowY === "scroll";
  }, { timeout: 3000 }).toBe(true);
}

async function expectMobilePanelSizing(page, viewportWidth) {
  const expectedWidth = Math.min(380, viewportWidth);
  await expect.poll(async () => {
    const g = await panelGeometry(page);
    return (
      Math.abs(g.width - expectedWidth) <= 1 &&
      Math.abs(g.right - g.viewportWidth) <= 1
    );
  }, { timeout: 3000 }).toBe(true);
}

async function expectPanelTopmostAtBottom(page) {
  await expect.poll(async () => page.locator(".sx-details").evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    const x = Math.max(rect.left + 12, Math.min(rect.right - 12, window.innerWidth - 12));
    const y = Math.max(rect.top + 12, Math.min(rect.bottom - 18, window.innerHeight - 18));
    const top = document.elementFromPoint(x, y);
    return Boolean(top && (top === panel || panel.contains(top)));
  }), { timeout: 3000 }).toBe(true);
}

test("desktop keeps Lead Intelligence as a stable scrollable fourth rail", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await ensureConversationSelected(page);

  const panel = page.locator(".sx-details");
  await expect(panel).toBeVisible();
  await expect(page.locator(".sx-details-backdrop")).toBeHidden();
  await expect(page.locator(".sx-details-close")).toBeHidden();
  await expect(page.locator(".sx-lead-btn")).toBeHidden();
  await expectPanelSettledInsideViewport(page);
  await expectPanelScrollable(page);
  await attachShot(page, testInfo, "inbox-right-panel-desktop-1440");
});

for (const viewport of [
  { name: "laptop-drawer", width: 1200, height: 700 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-360", width: 360, height: 800 },
]) {
  test(`${viewport.name} Lead button opens and closes the scrollable intelligence drawer`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);
    await ensureConversationSelected(page);

    const root = page.locator(".sx-inbox");
    const leadButton = page.locator(".sx-lead-btn");
    const panel = page.locator(".sx-details");
    const backdrop = page.locator(".sx-details-backdrop");
    const close = page.locator(".sx-details-close");

    await expect(leadButton).toBeVisible();
    await expect(leadButton).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    await expect(backdrop).toBeHidden();

    await leadButton.click();
    await expect(root).toHaveClass(/sx-details-open/);
    await expect(leadButton).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await expect(backdrop).toBeVisible();
    await expect(close).toBeVisible();
    await expectPanelSettledInsideViewport(page);
    await expectPanelScrollable(page);
    if (viewport.width <= 767) {
      await expectMobilePanelSizing(page, viewport.width);
    }
    await expectPanelTopmostAtBottom(page);
    await attachShot(page, testInfo, `inbox-right-panel-${viewport.name}-open`);

    await close.click();
    await expect(root).not.toHaveClass(/sx-details-open/);
    await expect(leadButton).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    await expect(backdrop).toBeHidden();
  });
}
