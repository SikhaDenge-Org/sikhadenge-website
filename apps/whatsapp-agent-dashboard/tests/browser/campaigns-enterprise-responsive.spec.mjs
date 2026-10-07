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
  test(`Campaigns workspace stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.route("**/api/campaigns/preview", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 2,
          previewLimit: 30,
          launchBatchLimit: 1000,
          recipients: [
            {
              id: "campaign-ui-recipient-1",
              name: "CI Browser Learner",
              phone: "+919999000001",
              city: "Varanasi",
              language: "en",
              stage: "QUALIFIED",
              temperature: "HOT",
              course: "AI Business Growth Architect Program",
              assignedTo: null,
            },
            {
              id: "campaign-ui-recipient-2",
              name: "Responsive QA Learner",
              phone: "+919999000002",
              city: "Varanasi",
              language: "hi",
              stage: "NEW",
              temperature: "WARM",
              course: "AI Expert Program",
              assignedTo: "CI Admin",
            },
          ],
        }),
      });
    });

    await login(page);
    await page.goto("/campaigns", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/campaigns(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Campaigns & Targeting" })).toBeVisible();

    const manager = page.locator(".campaign-control-center");
    await expect(manager).toBeVisible();

    const metrics = manager.locator(":scope > .campaign-control-metrics > article");
    await expect(metrics).toHaveCount(4);
    await expect(metrics.nth(0).getByText("Outbound mode", { exact: true })).toBeVisible();
    await expect(metrics.nth(1).getByText("Approved templates", { exact: true })).toBeVisible();
    await expect(metrics.nth(2).getByText("Saved campaigns", { exact: true })).toBeVisible();
    await expect(metrics.nth(3).getByText("Maximum audience", { exact: true })).toBeVisible();

    const cards = manager.locator(":scope > .campaign-control-card");
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0).getByRole("heading", { name: "Build the exact student segment" })).toBeVisible();
    await expect(cards.nth(1).getByRole("heading", { name: "Personalise, schedule and control delivery" })).toBeVisible();
    await expect(cards.nth(2).getByText("Audience not previewed", { exact: true })).toBeVisible();
    await expect(cards.nth(3).getByRole("heading", { name: "History, scheduling and delivery controls" })).toBeVisible();

    const targetingFields = cards.nth(0).locator(".campaign-control-grid.four > label");
    await expect(targetingFields).toHaveCount(8);
    const setupFields = cards.nth(1).locator(".campaign-control-grid.three > label");
    await expect(setupFields).toHaveCount(6);

    const metricBoxes = await metrics.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width };
      }),
    );

    if (viewport.width > 1180) {
      for (let index = 1; index < metricBoxes.length; index += 1) {
        expect(Math.abs(metricBoxes[index].top - metricBoxes[0].top)).toBeLessThanOrEqual(2);
      }
    } else {
      expect(Math.abs(metricBoxes[0].top - metricBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(metricBoxes[2].top).toBeGreaterThan(metricBoxes[0].top);
      expect(Math.abs(metricBoxes[2].top - metricBoxes[3].top)).toBeLessThanOrEqual(2);
    }

    const targetingBoxes = await targetingFields.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width };
      }),
    );

    if (viewport.width > 1180) {
      expect(Math.abs(targetingBoxes[0].top - targetingBoxes[3].top)).toBeLessThanOrEqual(2);
      expect(targetingBoxes[4].top).toBeGreaterThan(targetingBoxes[0].top);
    } else {
      expect(Math.abs(targetingBoxes[0].top - targetingBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(targetingBoxes[2].top).toBeGreaterThan(targetingBoxes[0].top);
    }

    const setupBoxes = await setupFields.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width };
      }),
    );

    if (viewport.width > 1180) {
      expect(Math.abs(setupBoxes[0].top - setupBoxes[2].top)).toBeLessThanOrEqual(2);
      expect(setupBoxes[3].top).toBeGreaterThan(setupBoxes[0].top);
    } else if (viewport.width > 767) {
      expect(Math.abs(setupBoxes[0].top - setupBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(setupBoxes[2].top).toBeGreaterThan(setupBoxes[0].top);
    } else {
      for (let index = 1; index < setupBoxes.length; index += 1) {
        expect(setupBoxes[index].top).toBeGreaterThan(setupBoxes[index - 1].top);
      }
    }

    await cards.nth(0).getByRole("button", { name: "Preview audience" }).click();
    await expect(cards.nth(2).getByText("2 eligible contacts", { exact: true })).toBeVisible();
    const recipientTable = cards.nth(2).locator(".campaign-control-table-wrap");
    await expect(recipientTable).toBeVisible();
    await expect(recipientTable.getByText("CI Browser Learner", { exact: true })).toBeVisible();

    if (viewport.width <= 767) {
      const controls = manager.locator("select, input, button");
      const controlCount = await controls.count();
      expect(controlCount).toBeGreaterThan(12);
      for (let index = 0; index < controlCount; index += 1) {
        if (await controls.nth(index).isVisible()) {
          await expectInsideViewport(controls.nth(index), viewport.width);
        }
      }

      const reset = cards.nth(0).getByRole("button", { name: "Reset" });
      const previewButton = cards.nth(0).getByRole("button", { name: "Preview audience" });
      const operationsRefresh = cards.nth(3).getByRole("button", { name: "Refresh" });
      for (const control of [reset, previewButton, operationsRefresh]) {
        const height = await control.evaluate((node) => node.getBoundingClientRect().height);
        expect(height).toBeGreaterThanOrEqual(44);
      }

      const selectFontSize = await cards.nth(0).getByLabel("Preset").evaluate(
        (node) => Number.parseFloat(getComputedStyle(node).fontSize),
      );
      const inputFontSize = await cards.nth(1).getByLabel("Campaign name").evaluate(
        (node) => Number.parseFloat(getComputedStyle(node).fontSize),
      );
      expect(selectFontSize).toBeGreaterThanOrEqual(16);
      expect(inputFontSize).toBeGreaterThanOrEqual(16);

      const tableGeometry = await recipientTable.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        overflowX: getComputedStyle(node).overflowX,
        overscrollX: getComputedStyle(node).overscrollBehaviorX,
        overscrollY: getComputedStyle(node).overscrollBehaviorY,
      }));
      expect(tableGeometry.scrollWidth).toBeGreaterThan(tableGeometry.clientWidth);
      expect(["auto", "scroll"]).toContain(tableGeometry.overflowX);
      expect(tableGeometry.overscrollX).toBe("contain");
      expect(tableGeometry.overscrollY).toBe("auto");
      await recipientTable.evaluate((node) => {
        node.scrollLeft = Math.min(160, node.scrollWidth - node.clientWidth);
      });
      expect(await recipientTable.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    }

    await expectNoRootOverflow(page);
    await testInfo.attach(`campaigns-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
