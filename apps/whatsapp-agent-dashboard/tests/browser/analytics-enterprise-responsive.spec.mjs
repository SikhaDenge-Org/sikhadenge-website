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
  test(`Analytics workspace stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);

    await page.goto("/analytics", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/analytics(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Analytics & Retargeting" })).toBeVisible();

    const manager = page.locator(".suite-stack.analytics-manager");
    await expect(manager).toBeVisible();

    const metrics = manager.locator(":scope > .suite-metrics > article");
    await expect(metrics).toHaveCount(4);
    await expect(metrics.nth(0).getByText("Contacts", { exact: true })).toBeVisible();
    await expect(metrics.nth(1).getByText("Open conversations", { exact: true })).toBeVisible();
    await expect(metrics.nth(2).getByText("Leads", { exact: true })).toBeVisible();
    await expect(metrics.nth(3).getByText("Revenue recorded", { exact: true })).toBeVisible();

    const primaryGrid = manager.locator(":scope > .suite-grid.two");
    await expect(primaryGrid).toHaveCount(1);
    const primaryCards = primaryGrid.locator(":scope > .suite-card");
    await expect(primaryCards).toHaveCount(2);
    await expect(primaryCards.nth(0).getByRole("heading", { name: "Inbound and outbound message volume" })).toBeVisible();
    await expect(primaryCards.nth(1).getByRole("heading", { name: "Outbound delivery and read rates" })).toBeVisible();
    await expect(primaryCards.nth(0).getByRole("button", { name: "Refresh" })).toBeVisible();

    const bars = primaryCards.nth(0).locator(".analytics-bar-day");
    const barCount = await bars.count();
    expect(barCount).toBeGreaterThan(0);

    const rateCards = primaryCards.nth(1).locator(".analytics-rate-grid > article");
    await expect(rateCards).toHaveCount(3);
    await expect(rateCards.nth(0).getByText("Delivered", { exact: true })).toBeVisible();
    await expect(rateCards.nth(1).getByText("Read", { exact: true })).toBeVisible();
    await expect(rateCards.nth(2).getByText("Failed", { exact: true })).toBeVisible();

    const threeColumnGrids = manager.locator(":scope > .suite-grid.three");
    await expect(threeColumnGrids).toHaveCount(2);
    await expect(threeColumnGrids.nth(0).locator(":scope > .suite-card")).toHaveCount(3);
    await expect(threeColumnGrids.nth(1).locator(":scope > .suite-card")).toHaveCount(3);

    const retargeting = manager.locator(":scope > .suite-card .retargeting-grid");
    await expect(retargeting).toHaveCount(1);
    await expect(retargeting.locator(":scope > article")).toHaveCount(7);
    await expect(page.getByText("Consent-safe audiences ready for campaign preview", { exact: true })).toBeVisible();
    await expect(retargeting.getByText("Suppressed", { exact: true })).toBeVisible();

    const metricBoxes = await metrics.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width };
      }),
    );

    expect(metricBoxes).toHaveLength(4);
    if (viewport.width > 1280) {
      for (let index = 1; index < metricBoxes.length; index += 1) {
        expect(Math.abs(metricBoxes[index].top - metricBoxes[0].top)).toBeLessThanOrEqual(2);
      }
    } else {
      expect(Math.abs(metricBoxes[0].top - metricBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(metricBoxes[2].top).toBeGreaterThan(metricBoxes[0].top);
      expect(Math.abs(metricBoxes[2].top - metricBoxes[3].top)).toBeLessThanOrEqual(2);
    }

    const activityBox = await primaryCards.nth(0).boundingBox();
    const deliveryBox = await primaryCards.nth(1).boundingBox();
    expect(activityBox).not.toBeNull();
    expect(deliveryBox).not.toBeNull();
    if (viewport.width > 1280) {
      expect(deliveryBox.x).toBeGreaterThan(activityBox.x + activityBox.width - 2);
      expect(Math.abs(deliveryBox.y - activityBox.y)).toBeLessThanOrEqual(2);
    } else {
      expect(deliveryBox.y).toBeGreaterThan(activityBox.y + activityBox.height - 2);
    }

    const funnelCards = threeColumnGrids.nth(0).locator(":scope > .suite-card");
    const funnelBoxes = await funnelCards.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width };
      }),
    );

    if (viewport.width > 1280) {
      expect(Math.abs(funnelBoxes[0].top - funnelBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(Math.abs(funnelBoxes[0].top - funnelBoxes[2].top)).toBeLessThanOrEqual(2);
    } else if (viewport.width > 767) {
      expect(Math.abs(funnelBoxes[0].top - funnelBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(funnelBoxes[2].top).toBeGreaterThan(funnelBoxes[0].top);
    } else {
      expect(funnelBoxes[1].top).toBeGreaterThan(funnelBoxes[0].top);
      expect(funnelBoxes[2].top).toBeGreaterThan(funnelBoxes[1].top);
    }

    const retargetingCards = retargeting.locator(":scope > article");
    const retargetingBoxes = await retargetingCards.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width };
      }),
    );

    if (viewport.width > 1280) {
      expect(Math.abs(retargetingBoxes[0].top - retargetingBoxes[3].top)).toBeLessThanOrEqual(2);
      expect(retargetingBoxes[4].top).toBeGreaterThan(retargetingBoxes[0].top);
    } else if (viewport.width > 767) {
      expect(Math.abs(retargetingBoxes[0].top - retargetingBoxes[2].top)).toBeLessThanOrEqual(2);
      expect(retargetingBoxes[3].top).toBeGreaterThan(retargetingBoxes[0].top);
    } else {
      expect(Math.abs(retargetingBoxes[0].top - retargetingBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(retargetingBoxes[2].top).toBeGreaterThan(retargetingBoxes[0].top);
    }

    if (viewport.width <= 767) {
      const refreshButton = primaryCards.nth(0).getByRole("button", { name: "Refresh" });
      await expectInsideViewport(refreshButton, viewport.width);
      await expectInsideViewport(primaryCards.nth(0), viewport.width);
      await expectInsideViewport(primaryCards.nth(1), viewport.width);
      await expectInsideViewport(retargeting, viewport.width);

      const refreshHeight = await refreshButton.evaluate((node) => node.getBoundingClientRect().height);
      expect(refreshHeight).toBeGreaterThanOrEqual(44);

      const chartGeometry = await primaryCards.nth(0).locator(".analytics-bars").evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        overflowX: getComputedStyle(node).overflowX,
      }));
      expect(chartGeometry.scrollWidth).toBeGreaterThan(chartGeometry.clientWidth);
      expect(["auto", "scroll"]).toContain(chartGeometry.overflowX);

      const firstDayLabel = bars.first().locator("small");
      await expect(firstDayLabel).toBeVisible();
      const dayLabelSize = await firstDayLabel.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
      expect(dayLabelSize).toBeGreaterThanOrEqual(9);
    }

    await expectNoRootOverflow(page);
    await testInfo.attach(`analytics-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
