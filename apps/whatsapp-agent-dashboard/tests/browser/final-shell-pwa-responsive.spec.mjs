import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.DASHBOARD_ADMIN_EMAIL || "admin@example.invalid";
const ADMIN_PASSWORD = process.env.DASHBOARD_ADMIN_PASSWORD || "CI-only-password-12345";
const BASE_URL = process.env.APP_URL || "http://127.0.0.1:3100";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact-desktop", width: 1280, height: 800 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

async function expectNoRootOverflow(page) {
  const geometry = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 2);
  expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.innerWidth + 2);
}

async function expectInsideViewport(locator, viewportWidth) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth + 1);
}

async function login(page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Work Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/inbox(?:\?|$)/);
}

for (const viewport of VIEWPORTS) {
  test(`Login shell stays branded and usable at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

    const shell = page.locator(".split01");
    const email = page.getByLabel("Work Email");
    const password = page.getByLabel("Password", { exact: true });
    const submit = page.getByRole("button", { name: "Sign In" });
    const hero = page.locator(".split01__hero");
    const heroImage = page.locator(".split01__hero-approved-image").first();
    const legacyTopBrand = page.locator(".split01__brand img");
    const panelBrand = page.locator(".split01__signin-brand img").first();

    await expect(shell).toBeVisible();
    await expect(shell).toHaveAttribute("data-page01-hero", "approved-hq-v11");
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(submit).toBeVisible();
    await expect(hero).toBeVisible();
    await expect(heroImage).toBeVisible();
    await expect(legacyTopBrand).toHaveCount(0);
    await expect(panelBrand).toBeVisible();

    for (const control of [email, password, submit]) {
      const height = await control.evaluate((node) => node.getBoundingClientRect().height);
      expect(height).toBeGreaterThanOrEqual(44);
      await expectInsideViewport(control, viewport.width);
    }

    const brandGeometry = await panelBrand.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(brandGeometry.width).toBeGreaterThanOrEqual(viewport.width <= 767 ? 96 : 120);
    expect(brandGeometry.height).toBeGreaterThan(20);
    await expectInsideViewport(panelBrand, viewport.width);

    if (viewport.width <= 767) {
      const inputFont = await email.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
      expect(inputFont).toBeGreaterThanOrEqual(16);
    }

    await email.focus();
    const focusStyle = await email.evaluate((node) => {
      const style = getComputedStyle(node);
      return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle };
    });
    expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2);
    expect(focusStyle.outlineStyle).not.toBe("none");

    await expectInsideViewport(shell, viewport.width);
    await expectNoRootOverflow(page);

    await testInfo.attach(`final-shell-login-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });

  test(`Offline recovery shell stays contained at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/offline", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/offline(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    await expect(page.getByText("Existing customer conversations are not cached for privacy.", { exact: false })).toBeVisible();

    const shell = page.locator(".offline-shell");
    const card = page.locator(".offline-card");
    const brand = page.locator(".offline-brand__wordmark");
    const retry = page.getByRole("link", { name: "Try again" });

    await expect(shell).toBeVisible();
    await expect(card).toBeVisible();
    await expect(brand).toBeVisible();
    await expect(retry).toBeVisible();

    const brandWidth = await brand.evaluate((node) => node.getBoundingClientRect().width);
    expect(brandWidth).toBeGreaterThanOrEqual(140);

    const retryHeight = await retry.evaluate((node) => node.getBoundingClientRect().height);
    expect(retryHeight).toBeGreaterThanOrEqual(viewport.width <= 767 ? 48 : 44);

    await retry.focus();
    const retryFocus = await retry.evaluate((node) => {
      const style = getComputedStyle(node);
      return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle };
    });
    expect(Number.parseFloat(retryFocus.outlineWidth)).toBeGreaterThanOrEqual(2);
    expect(retryFocus.outlineStyle).not.toBe("none");

    await expectInsideViewport(card, viewport.width);
    await expectInsideViewport(retry, viewport.width);
    await expectNoRootOverflow(page);

    await testInfo.attach(`final-shell-offline-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}

test("Root entry routes unauthenticated users to login and authenticated users to inbox", async ({ browser }) => {
  const anonymousContext = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: "block" });
  const anonymousPage = await anonymousContext.newPage();
  await anonymousPage.goto("/", { waitUntil: "domcontentloaded" });
  await expect(anonymousPage).toHaveURL(/\/login(?:\?|$)/);
  await anonymousContext.close();

  const authenticatedContext = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: "block" });
  const authenticatedPage = await authenticatedContext.newPage();
  await login(authenticatedPage);
  await authenticatedPage.goto("/", { waitUntil: "domcontentloaded" });
  await expect(authenticatedPage).toHaveURL(/\/inbox(?:\?|$)/);
  await authenticatedContext.close();
});

test("PWA service worker keeps APIs network-only and serves the privacy-safe offline shell", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: "allow" });
  const page = await context.newPage();

  try {
    await page.goto("/offline", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();

    const workerState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const cacheNames = await caches.keys();
      const offlineCached = Boolean(await caches.match("/offline"));
      return {
        scope: registration.scope,
        active: Boolean(registration.active),
        cacheNames,
        offlineCached,
      };
    });

    expect(workerState.scope.endsWith("/")).toBeTruthy();
    expect(workerState.active).toBeTruthy();
    expect(workerState.cacheNames).toContain("sikhadenge-agent-shell-v2");
    expect(workerState.offlineCached).toBeTruthy();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBeTruthy();

    await context.setOffline(true);

    const apiResult = await page.evaluate(async () => {
      try {
        await fetch("/api/meta/status");
        return "response";
      } catch {
        return "network-error";
      }
    });
    expect(apiResult).toBe("network-error");

    await page.goto("/offline?final-shell-offline-probe=1", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-phase15-offline-shell="true"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    await expect(page.getByText("Existing customer conversations are not cached for privacy.", { exact: false })).toBeVisible();
  } finally {
    await context.setOffline(false).catch(() => undefined);
    await context.close();
  }
});
