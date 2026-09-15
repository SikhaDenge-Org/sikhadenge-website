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

async function ensureChat(page) {
  const chat = page.locator(".sx-chat");
  if (await chat.isVisible()) return;
  const first = page.locator(".sx-convo").first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(chat).toBeVisible();
}

async function expectNoRootOverflow(page) {
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(geometry.html).toBeLessThanOrEqual(geometry.viewport + 2);
  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 2);
}

const MATRIX = [
  { width: 320, height: 700 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 767, height: 900 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 912, height: 1368 },
  { width: 1179, height: 820 },
  { width: 1180, height: 820 },
  { width: 1199, height: 820 },
  { width: 1200, height: 800 },
  { width: 1366, height: 768 },
  { width: 1439, height: 900 },
  { width: 1440, height: 900 },
  { width: 1536, height: 960 },
  { width: 1920, height: 1080 },
];

for (const viewport of MATRIX) {
  test(`Inbox stays inside ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await login(page);
    await ensureChat(page);

    await expectNoRootOverflow(page);
    await expect(page.locator(".sx-composer")).toBeVisible();

    const geometry = await page.evaluate(() => {
      const root = document.querySelector(".sx-inbox");
      const chat = document.querySelector(".sx-chat");
      const composer = document.querySelector(".sx-composer");
      if (!(root instanceof HTMLElement) || !(chat instanceof HTMLElement) || !(composer instanceof HTMLElement)) {
        throw new Error("Inbox geometry nodes missing");
      }
      const rr = root.getBoundingClientRect();
      const cr = chat.getBoundingClientRect();
      const mr = composer.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        root: { left: rr.left, right: rr.right, top: rr.top, bottom: rr.bottom },
        chat: { left: cr.left, right: cr.right, top: cr.top, bottom: cr.bottom },
        composer: { left: mr.left, right: mr.right, top: mr.top, bottom: mr.bottom },
      };
    });

    expect(geometry.root.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.root.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.chat.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.chat.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.composer.left).toBeGreaterThanOrEqual(geometry.chat.left - 1);
    expect(geometry.composer.right).toBeLessThanOrEqual(geometry.chat.right + 1);
    expect(geometry.composer.top).toBeGreaterThanOrEqual(0);
    expect(geometry.composer.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  });
}

test("320px mobile keeps all five primary dock destinations usable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await login(page);
  await ensureChat(page);

  const destinations = await page.locator(
    ".sx-side-scroll .rail-button, .sx-side-foot > .sx-navitem",
  ).evaluateAll((nodes) => nodes.flatMap((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    if (style.display === "none" || rect.width < 1 || rect.height < 1) return [];
    return [{
      title: node.getAttribute("aria-label") || node.textContent?.trim() || "unknown",
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
    }];
  }));

  expect(destinations.map((item) => item.title)).toEqual([
    "Inbox",
    "Contacts",
    "Leads",
    "Campaigns",
    "Settings",
  ]);

  for (const item of destinations) {
    expect(item.left, `${item.title} starts outside viewport`).toBeGreaterThanOrEqual(-1);
    expect(item.right, `${item.title} ends outside viewport`).toBeLessThanOrEqual(321);
    expect(item.width, `${item.title} lane is too narrow`).toBeGreaterThanOrEqual(50);
    expect(item.height, `${item.title} lane is too short`).toBeGreaterThanOrEqual(48);
  }

  await expectNoRootOverflow(page);
});

test("pending channel CTA opens Integrations instead of creating a fake empty filter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  const emailChannel = page.locator(".sx-chan", { hasText: "Email" }).first();
  await expect(emailChannel).toBeVisible();
  await emailChannel.click();
  await expect(page).toHaveURL(/\/integrations\?channel=email$/);
});

test("Lead Intelligence always stays above the runtime-docked composer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await ensureChat(page);

  const lead = page.locator(".sx-lead-btn");
  await expect(lead).toBeVisible();
  await lead.click();
  await expect(page.locator(".sx-inbox")).toHaveClass(/sx-details-open/);
  await expect(page.locator(".sx-details")).toBeVisible();

  const stack = await page.evaluate(() => {
    const composer = document.querySelector(".sx-composer");
    const panel = document.querySelector(".sx-details");
    if (!(composer instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      throw new Error("Stacking nodes missing");
    }
    return {
      composerZ: Number.parseInt(getComputedStyle(composer).zIndex || "0", 10),
      panelZ: Number.parseInt(getComputedStyle(panel).zIndex || "0", 10),
      composerPointerEvents: getComputedStyle(composer).pointerEvents,
    };
  });

  expect(stack.panelZ).toBeGreaterThan(stack.composerZ);
  expect(stack.composerPointerEvents).toBe("none");
});
