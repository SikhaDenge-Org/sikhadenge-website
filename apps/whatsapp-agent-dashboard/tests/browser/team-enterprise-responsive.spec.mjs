import { expect, test } from "@playwright/test";

const ADMIN_EMAIL =
  process.env.DASHBOARD_ADMIN_EMAIL || "admin@example.invalid";
const ADMIN_PASSWORD =
  process.env.DASHBOARD_ADMIN_PASSWORD || "CI-only-password-12345";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact-desktop", width: 1280, height: 800 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

async function login(page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Work Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/inbox(?:\?|$)/);
}

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

for (const viewport of VIEWPORTS) {
  test(`Team live queue stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);

    await page.goto("/team", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/team(?:\?|$)/);
    await expect(page.locator(".team-chat-manager")).toBeVisible();
    await expect(page.locator(".team-metrics > article")).toHaveCount(6);
    await expect(page.locator(".team-queue-card")).toBeVisible();
    await expect(page.locator(".team-agents-card")).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();

    const search = page.locator('.team-toolbar input[placeholder*="Search learner"]');
    await expect(search).toBeVisible();
    const filters = page.locator(".team-filter-tabs > button");
    await expect(filters).toHaveCount(5);
    await expect(page.getByRole("button", { name: "ALL", exact: true })).toHaveClass(/active/);

    const activeFilterStyle = await page
      .getByRole("button", { name: "ALL", exact: true })
      .evaluate((node) => ({
        background: getComputedStyle(node).backgroundColor,
        color: getComputedStyle(node).color,
      }));
    expect(activeFilterStyle.background).not.toBe("rgba(0, 0, 0, 0)");

    const firstItem = page.locator(".team-queue-item").first();
    await expect(firstItem).toBeVisible();
    await expect(firstItem.getByText("CI Browser Learner", { exact: true })).toBeVisible();
    await expect(firstItem.getByRole("button", { name: "Open inbox" })).toBeVisible();
    await expect(firstItem.getByRole("button", { name: "Claim chat" })).toBeVisible();
    await expect(firstItem.locator(".team-transfer select")).toBeVisible();
    await expect(firstItem.locator(".team-transfer").getByRole("button", { name: "Transfer" })).toBeVisible();

    const currentQueueGeometry = await firstItem.locator(".team-queue-main").evaluate((node) => ({
      display: getComputedStyle(node).display,
      paddingTop: getComputedStyle(node).paddingTop,
      borderBottomWidth: getComputedStyle(node).borderBottomWidth,
    }));
    expect(currentQueueGeometry.display).toBe("grid");
    expect(currentQueueGeometry.paddingTop).toBe("0px");
    expect(currentQueueGeometry.borderBottomWidth).toBe("0px");

    const transferGeometry = await firstItem.locator(".team-transfer").evaluate((node) => ({
      display: getComputedStyle(node).display,
      paddingTop: getComputedStyle(node).paddingTop,
      borderTopWidth: getComputedStyle(node).borderTopWidth,
    }));
    expect(transferGeometry.display).toBe("grid");
    expect(transferGeometry.paddingTop).toBe("0px");
    expect(transferGeometry.borderTopWidth).toBe("0px");

    // Exercise the visible queue filter state without mutating ownership.
    await page.getByRole("button", { name: "UNASSIGNED", exact: true }).click();
    await expect(page.getByRole("button", { name: "UNASSIGNED", exact: true })).toHaveClass(/active/);
    await expect(firstItem).toBeVisible();
    await page.getByRole("button", { name: "ALL", exact: true }).click();
    await expect(page.getByRole("button", { name: "ALL", exact: true })).toHaveClass(/active/);

    await search.fill("CI Browser");
    await expect(page.locator(".team-queue-item")).toHaveCount(1);
    await search.fill("");

    const queueBox = await page.locator(".team-queue-card").boundingBox();
    const agentsBox = await page.locator(".team-agents-card").boundingBox();
    expect(queueBox).not.toBeNull();
    expect(agentsBox).not.toBeNull();

    if (viewport.width > 1180) {
      expect(agentsBox.x).toBeGreaterThan(queueBox.x + queueBox.width - 2);
    } else {
      expect(agentsBox.y).toBeGreaterThan(queueBox.y + queueBox.height - 2);
    }

    await expect(page.locator(".team-agent-list > article")).not.toHaveCount(0);
    await expectNoRootOverflow(page);

    if (viewport.width === 1440) {
      const metricBoxes = await page.locator(".team-metrics > article").evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, top: rect.top, width: rect.width };
        }),
      );
      expect(metricBoxes).toHaveLength(6);
      for (let index = 1; index < metricBoxes.length; index += 1) {
        expect(Math.abs(metricBoxes[index].top - metricBoxes[0].top)).toBeLessThanOrEqual(2);
      }
    }

    if (viewport.width === 1280 || viewport.width === 1024) {
      const metricBoxes = await page.locator(".team-metrics > article").evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, width: rect.width };
        }),
      );
      expect(metricBoxes).toHaveLength(6);
      expect(Math.abs(metricBoxes[0].top - metricBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(Math.abs(metricBoxes[0].top - metricBoxes[2].top)).toBeLessThanOrEqual(2);
      expect(metricBoxes[3].top).toBeGreaterThan(metricBoxes[0].top);
    }

    if (viewport.width <= 767) {
      await expectInsideViewport(search, viewport.width);
      for (let index = 0; index < 5; index += 1) {
        await expectInsideViewport(filters.nth(index), viewport.width);
      }

      const filterBoxes = await filters.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, top: rect.top, width: rect.width };
        }),
      );
      expect(Math.abs(filterBoxes[0].top - filterBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(filterBoxes[2].top).toBeGreaterThan(filterBoxes[0].top);
      expect(filterBoxes[4].top).toBeGreaterThan(filterBoxes[2].top);
      expect(filterBoxes[4].width).toBeGreaterThan(filterBoxes[0].width * 1.8);

      await expectInsideViewport(firstItem, viewport.width);
      const actionControls = firstItem.locator(
        ".team-queue-actions > button, .team-transfer > select, .team-transfer > button",
      );
      await expect(actionControls).toHaveCount(4);
      for (let index = 0; index < 4; index += 1) {
        await expectInsideViewport(actionControls.nth(index), viewport.width);
      }

      const titleDirection = await firstItem
        .locator(".team-queue-title")
        .evaluate((node) => getComputedStyle(node).flexDirection);
      expect(titleDirection).toBe("column");

      const metricBoxes = await page.locator(".team-metrics > article").evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, top: rect.top, width: rect.width };
        }),
      );
      expect(metricBoxes).toHaveLength(6);
      expect(Math.abs(metricBoxes[0].top - metricBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(metricBoxes[2].top).toBeGreaterThan(metricBoxes[0].top);
      expect(Math.abs(metricBoxes[2].top - metricBoxes[3].top)).toBeLessThanOrEqual(2);
      expect(metricBoxes[4].top).toBeGreaterThan(metricBoxes[2].top);
      expect(Math.abs(metricBoxes[4].top - metricBoxes[5].top)).toBeLessThanOrEqual(2);
    }

    await expectNoRootOverflow(page);
    await testInfo.attach(`team-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
