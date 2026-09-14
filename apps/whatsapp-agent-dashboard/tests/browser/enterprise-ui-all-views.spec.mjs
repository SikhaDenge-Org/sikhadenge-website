import { expect, test } from "@playwright/test";

const ADMIN_EMAIL =
  process.env.DASHBOARD_ADMIN_EMAIL || "admin@example.invalid";
const ADMIN_PASSWORD =
  process.env.DASHBOARD_ADMIN_PASSWORD || "CI-only-password-12345";

const MODULE_ROUTES = [
  "/contacts",
  "/leads",
  "/team",
  "/engagement",
  "/analytics",
  "/knowledge",
  "/training",
  "/campaigns",
  "/automation",
  "/templates",
  "/integrations",
  "/settings",
  "/admin",
  "/cutover",
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

async function waitForFonts(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}

async function attachViewport(page, testInfo, name) {
  const body = await page.screenshot({ fullPage: false });
  await testInfo.attach(name, { body, contentType: "image/png" });
}

async function expectNoRootHorizontalOverflow(page) {
  const geometry = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 2);
  expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.innerWidth + 2);
}

async function expectManropeFont(page) {
  const family = await page.locator("body").evaluate(
    (node) => getComputedStyle(node).fontFamily.toLowerCase(),
  );
  expect(family).toContain("manrope");
}

async function login(page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".split01")).toBeVisible();
  await page.getByLabel("Work Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/inbox(?:\?|$)/);
  await expect(page.locator(".sx-inbox")).toBeVisible();
}

async function validateModuleShell(page, viewport) {
  const shell = page.locator(".sx-module");
  const workspace = page.locator(".sx-workspace");
  const heading = page.locator(".sx-workspace-copy h1");

  await expect(shell).toBeVisible();
  await expect(workspace).toBeVisible();
  await expect(heading).toBeVisible();

  const titleSize = await heading.evaluate(
    (node) => Number.parseFloat(getComputedStyle(node).fontSize),
  );
  expect(titleSize).toBeGreaterThanOrEqual(18);
  expect(titleSize).toBeLessThanOrEqual(25);

  if (viewport.width <= 767) {
    await expect(page.locator(".sx-mobile-dock")).toBeVisible();

    const mobileLayout = await page.evaluate(() => {
      const workspaceNode = document.querySelector(".sx-module > .sx-workspace");
      if (!(workspaceNode instanceof HTMLElement)) {
        throw new Error("Module workspace was not rendered.");
      }
      const rect = workspaceNode.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        workspaceLeft: rect.left,
        workspaceRight: rect.right,
        workspaceWidth: rect.width,
      };
    });

    expect(mobileLayout.workspaceLeft).toBeLessThanOrEqual(1);
    expect(mobileLayout.workspaceRight).toBeGreaterThanOrEqual(
      mobileLayout.viewportWidth - 1,
    );
    expect(mobileLayout.workspaceWidth).toBeGreaterThanOrEqual(
      mobileLayout.viewportWidth - 2,
    );
  } else {
    const side = page.locator(".sx-side");
    await expect(side).toBeVisible();

    const placement = await page.evaluate(() => {
      const sideNode = document.querySelector(".sx-module > .sx-side");
      const workspaceNode = document.querySelector(".sx-module > .sx-workspace");
      if (!(sideNode instanceof HTMLElement) || !(workspaceNode instanceof HTMLElement)) {
        throw new Error("Module sidebar or workspace was not rendered.");
      }
      const sideRect = sideNode.getBoundingClientRect();
      const workspaceRect = workspaceNode.getBoundingClientRect();
      return {
        sideLeft: sideRect.left,
        sideRight: sideRect.right,
        workspaceLeft: workspaceRect.left,
        workspaceRight: workspaceRect.right,
      };
    });

    expect(placement.sideLeft).toBeLessThan(placement.workspaceLeft);
    expect(placement.sideRight).toBeLessThanOrEqual(placement.workspaceLeft + 2);
    expect(placement.workspaceRight).toBeGreaterThan(placement.workspaceLeft);
  }
}

async function validateInbox(page, viewport) {
  await expect(page.locator(".sx-inbox")).toBeVisible();

  if (viewport.width <= 767) {
    const list = page.locator(".sx-list");
    const chat = page.locator(".sx-chat");

    if (await chat.isVisible()) {
      const back = page.getByRole("button", { name: "Back to conversations" });
      await expect(back).toBeVisible();
      await back.click();
    }

    await expect(list).toBeVisible();
    await expect(page.locator(".sx-list-title")).toBeVisible();

    const listTitleSize = await page.locator(".sx-list-title").evaluate(
      (node) => Number.parseFloat(getComputedStyle(node).fontSize),
    );
    expect(listTitleSize).toBeGreaterThanOrEqual(17);
    expect(listTitleSize).toBeLessThanOrEqual(19);

    const selected = page.locator(".conversation-item.selected");
    await expect(selected).toHaveCount(1);
    await selected.dispatchEvent("click");
    await expect(chat).toBeVisible();
    await expect(page.locator(".sx-composer")).toBeVisible();

    const composerFontSize = await page
      .locator(".sx-composer-row textarea")
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    expect(composerFontSize).toBeGreaterThanOrEqual(16);
    return;
  }

  await expect(page.locator(".sx-list")).toBeVisible();
  await expect(page.locator(".sx-list-title")).toBeVisible();
  await expect(page.locator(".sx-chat")).toBeVisible();

  const listTitleSize = await page.locator(".sx-list-title").evaluate(
    (node) => Number.parseFloat(getComputedStyle(node).fontSize),
  );
  expect(listTitleSize).toBeGreaterThanOrEqual(17);
  expect(listTitleSize).toBeLessThanOrEqual(19);

  await expect(page.locator(".conversation-item.selected")).toHaveCount(1);
}

for (const viewport of VIEWPORTS) {
  test(`enterprise UI remains stable across ${viewport.name} routes`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await waitForFonts(page);
    await expect(page.locator(".split01")).toBeVisible();
    await expectManropeFont(page);
    await expectNoRootHorizontalOverflow(page);
    await attachViewport(page, testInfo, `${viewport.name}-login`);

    await login(page);
    await waitForFonts(page);
    await expectManropeFont(page);
    await validateInbox(page, viewport);
    await expectNoRootHorizontalOverflow(page);
    await attachViewport(page, testInfo, `${viewport.name}-inbox`);

    for (const route of MODULE_ROUTES) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await waitForFonts(page);
      await expect(page).toHaveURL(new RegExp(`${route.replace("/", "\\/")}(?:\\?|$)`));
      await expectManropeFont(page);
      await validateModuleShell(page, viewport);
      await expectNoRootHorizontalOverflow(page);
      await attachViewport(
        page,
        testInfo,
        `${viewport.name}-${route.slice(1).replaceAll("/", "-")}`,
      );
    }
  });
}
