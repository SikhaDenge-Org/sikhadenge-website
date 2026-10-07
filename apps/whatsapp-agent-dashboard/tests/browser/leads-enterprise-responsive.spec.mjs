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
  test(`Leads stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);

    await page.goto("/leads", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/leads(?:\?|$)/);
    await expect(page.locator(".lead-manager")).toBeVisible();
    await expect(page.locator(".lead-metrics > article")).toHaveCount(5);
    await expect(page.locator(".lead-toolbar")).toBeVisible();
    await expect(page.locator(".lead-directory")).toBeVisible();
    await expect(page.locator(".lead-editor")).toBeVisible();
    await expect(page.getByText("Loading admission pipeline...", { exact: true })).toHaveCount(0);

    const firstRow = page.locator(".lead-table tbody tr").first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow).toHaveClass(/selected/);
    await expect(page.locator(".lead-editor h3")).toHaveText("CI Browser Learner");
    await expectNoRootOverflow(page);

    const directoryBox = await page.locator(".lead-directory").boundingBox();
    const editorBox = await page.locator(".lead-editor").boundingBox();
    expect(directoryBox).not.toBeNull();
    expect(editorBox).not.toBeNull();

    // The legacy stylesheet sets editor order:-1 below 1350px. The audit
    // contract keeps the directory first at every breakpoint.
    if (viewport.width > 1180) {
      expect(editorBox.x).toBeGreaterThan(directoryBox.x + directoryBox.width - 2);
    } else {
      expect(editorBox.y).toBeGreaterThan(directoryBox.y + directoryBox.height - 2);
    }

    if (viewport.width <= 767) {
      const filters = page.locator(
        ".lead-filter-group > input, .lead-filter-group > select, .lead-filter-group > label",
      );
      await expect(filters).toHaveCount(5);
      for (let index = 0; index < 5; index += 1) {
        await expectInsideViewport(filters.nth(index), viewport.width);
      }

      const viewButtons = page.locator(".lead-view-toggle > button");
      await expect(viewButtons).toHaveCount(3);
      for (let index = 0; index < 3; index += 1) {
        await expectInsideViewport(viewButtons.nth(index), viewport.width);
      }

      const tableWrap = page.locator(".lead-table-wrap");
      await expectInsideViewport(tableWrap, viewport.width);

      // Emulate a production-sized result set without changing the isolated
      // browser database. The mobile directory must remain bounded even when
      // many lead rows are present so the selected editor is still reachable.
      await tableWrap.evaluate((node) => {
        const tbody = node.querySelector("tbody");
        const row = tbody?.querySelector("tr");
        if (!tbody || !row) return;
        for (let index = 0; index < 60; index += 1) {
          tbody.appendChild(row.cloneNode(true));
        }
      });

      const tableGeometry = await tableWrap.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        maxHeight: getComputedStyle(node).maxHeight,
        overflowX: getComputedStyle(node).overflowX,
        overscrollX: getComputedStyle(node).overscrollBehaviorX,
        overscrollY: getComputedStyle(node).overscrollBehaviorY,
      }));
      expect(["auto", "scroll"]).toContain(tableGeometry.overflowX);
      expect(tableGeometry.scrollWidth).toBeGreaterThan(tableGeometry.clientWidth);
      expect(tableGeometry.overscrollX).toBe("contain");
      expect(tableGeometry.overscrollY).toBe("auto");
      expect(tableGeometry.maxHeight).not.toBe("none");
      expect(tableGeometry.scrollHeight).toBeGreaterThan(tableGeometry.clientHeight);
      expect(tableGeometry.clientHeight).toBeLessThanOrEqual(
        Math.min(viewport.height * 0.56 + 2, 522),
      );

      const horizontalTableScroll = await tableWrap.evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
        return node.scrollLeft;
      });
      expect(horizontalTableScroll).toBeGreaterThan(0);

      // Pipeline mode is a second dense mobile surface; keep its horizontal
      // board inside the page and independently scrollable.
      await page.getByRole("button", { name: "Pipeline" }).click();
      const kanban = page.locator(".lead-kanban");
      await expect(kanban).toBeVisible();
      await expectInsideViewport(kanban, viewport.width);
      const kanbanGeometry = await kanban.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        overscrollX: getComputedStyle(node).overscrollBehaviorX,
        overscrollY: getComputedStyle(node).overscrollBehaviorY,
      }));
      expect(kanbanGeometry.scrollWidth).toBeGreaterThan(kanbanGeometry.clientWidth);
      expect(kanbanGeometry.overscrollX).toBe("contain");
      expect(kanbanGeometry.overscrollY).toBe("auto");
      const horizontalKanbanScroll = await kanban.evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
        return node.scrollLeft;
      });
      expect(horizontalKanbanScroll).toBeGreaterThan(0);
      await page.getByRole("button", { name: "Table" }).click();
      await expect(page.locator(".lead-table-wrap")).toBeVisible();
    }

    if (viewport.width === 390) {
      const metricBoxes = await page.locator(".lead-metrics > article").evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, top: rect.top, width: rect.width };
        }),
      );
      expect(metricBoxes).toHaveLength(5);
      expect(Math.abs(metricBoxes[0].top - metricBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(Math.abs(metricBoxes[2].top - metricBoxes[3].top)).toBeLessThanOrEqual(2);
      expect(metricBoxes[2].top).toBeGreaterThan(metricBoxes[0].top);
      expect(metricBoxes[4].top).toBeGreaterThan(metricBoxes[2].top);
      expect(metricBoxes[4].width).toBeGreaterThan(metricBoxes[0].width * 1.8);
    }

    await expectNoRootOverflow(page);
    await testInfo.attach(`leads-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
