import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.DASHBOARD_ADMIN_EMAIL || "admin@example.invalid";
const ADMIN_PASSWORD = process.env.DASHBOARD_ADMIN_PASSWORD || "CI-only-password-12345";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact-desktop", width: 1280, height: 800 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

const BASE_DOCUMENTS = [
  {
    id: "knowledge-review-1",
    title: "Become AI Expert fees and scholarship policy for September admissions",
    category: "fees",
    sourceType: "manual",
    sourceUrl: "https://sikhadenge.in/masterclass/claude/free?source=knowledge-regression-reference",
    version: 3,
    status: "IN_REVIEW",
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveTo: "2026-09-30T00:00:00.000Z",
    approvedAt: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
    _count: { chunks: 7 },
  },
  {
    id: "knowledge-approved-1",
    title: "Become AI Expert class schedule and live-session timing",
    category: "schedule",
    sourceType: "manual",
    sourceUrl: null,
    version: 5,
    status: "APPROVED",
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveTo: null,
    approvedAt: "2026-09-02T08:00:00.000Z",
    createdAt: "2026-08-29T08:00:00.000Z",
    updatedAt: "2026-09-09T08:00:00.000Z",
    _count: { chunks: 5 },
  },
  {
    id: "knowledge-rejected-1",
    title: "Legacy admission offer copy retained for audit history",
    category: "admission",
    sourceType: "manual",
    sourceUrl: null,
    version: 2,
    status: "REJECTED",
    effectiveFrom: null,
    effectiveTo: null,
    approvedAt: null,
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-09-08T08:00:00.000Z",
    _count: { chunks: 3 },
  },
  {
    id: "knowledge-archived-1",
    title: "Archived certificate policy superseded by the current approved version",
    category: "certificate",
    sourceType: "manual",
    sourceUrl: null,
    version: 1,
    status: "ARCHIVED",
    effectiveFrom: null,
    effectiveTo: "2026-08-31T00:00:00.000Z",
    approvedAt: "2026-07-10T08:00:00.000Z",
    createdAt: "2026-07-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    _count: { chunks: 2 },
  },
];

const DOCUMENTS = [
  ...BASE_DOCUMENTS,
  ...Array.from({ length: 20 }, (_, index) => {
    const source = BASE_DOCUMENTS[index % BASE_DOCUMENTS.length];
    return {
      ...source,
      id: `knowledge-volume-${index + 1}`,
      title: `${source.title} · operational version ${index + 6}`,
      version: index + 6,
      updatedAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T10:00:00.000Z`,
      _count: { chunks: source._count.chunks + (index % 4) },
    };
  }),
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
  test(`Knowledge Base stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);

    const mutationRequests = [];
    await page.route("**/api/knowledge/documents**", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ documents: DOCUMENTS }),
        });
        return;
      }

      mutationRequests.push(`${request.method()} ${request.url()}`);
      await route.fulfill({
        status: 418,
        contentType: "application/json",
        body: JSON.stringify({ error: "Mutation blocked by browser regression." }),
      });
    });

    await page.goto("/knowledge", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/knowledge(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Knowledge Base" })).toBeVisible();

    const manager = page.locator(".knowledge-manager");
    await expect(manager).toBeVisible();

    const metrics = manager.locator(":scope > .knowledge-summary-row > article");
    await expect(metrics).toHaveCount(4);
    await expect(metrics.nth(0).getByText("Total documents", { exact: true })).toBeVisible();
    await expect(metrics.nth(1).getByText("Approved", { exact: true })).toBeVisible();
    await expect(metrics.nth(2).getByText("In review", { exact: true })).toBeVisible();
    await expect(metrics.nth(3).getByText("Search chunks", { exact: true })).toBeVisible();

    const metricBoxes = await metrics.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }));

    if (viewport.width > 1180) {
      for (let index = 1; index < metricBoxes.length; index += 1) {
        expect(Math.abs(metricBoxes[index].top - metricBoxes[0].top)).toBeLessThanOrEqual(2);
      }
    } else {
      expect(Math.abs(metricBoxes[0].top - metricBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(metricBoxes[2].top).toBeGreaterThan(metricBoxes[0].top);
      expect(Math.abs(metricBoxes[2].top - metricBoxes[3].top)).toBeLessThanOrEqual(2);
    }

    const workspace = manager.locator(":scope > .knowledge-workspace-grid");
    const formPanel = workspace.locator(":scope > .knowledge-form-panel");
    const libraryPanel = workspace.locator(":scope > .knowledge-library-panel");
    await expect(formPanel).toBeVisible();
    await expect(libraryPanel).toBeVisible();

    const formBox = await formPanel.boundingBox();
    const libraryBox = await libraryPanel.boundingBox();
    expect(formBox).not.toBeNull();
    expect(libraryBox).not.toBeNull();
    if (viewport.width > 1180) {
      expect(libraryBox.x).toBeGreaterThan(formBox.x + formBox.width - 2);
      expect(Math.abs(libraryBox.y - formBox.y)).toBeLessThanOrEqual(2);
    } else {
      expect(libraryBox.y).toBeGreaterThan(formBox.y + formBox.height - 2);
    }

    const titleInput = formPanel.getByLabel("Document title");
    const categorySelect = formPanel.getByLabel("Category");
    const sourceInput = formPanel.getByLabel(/Source URL/);
    const contentInput = formPanel.getByLabel("Knowledge content");
    const saveButton = formPanel.getByRole("button", { name: "Save for review" });
    await expect(titleInput).toBeVisible();
    await expect(categorySelect).toBeVisible();
    await expect(sourceInput).toBeVisible();
    await expect(contentInput).toBeVisible();
    await expect(saveButton).toBeVisible();

    const searchInput = libraryPanel.getByPlaceholder("Search title or category");
    const statusFilter = libraryPanel.getByLabel("Filter status");
    await expect(searchInput).toBeVisible();
    await expect(statusFilter).toBeVisible();

    const cards = libraryPanel.locator(".knowledge-document-card");
    await expect(cards).toHaveCount(DOCUMENTS.length);
    await expect(cards.first().getByText("In review", { exact: true })).toBeVisible();
    await expect(cards.first().getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(cards.first().getByRole("button", { name: "Reject" })).toBeVisible();
    await expect(cards.nth(1).getByRole("button", { name: "Archive" })).toBeVisible();

    await searchInput.fill("scholarship policy");
    await expect(cards).toHaveCount(6);
    await searchInput.fill("");
    await expect(cards).toHaveCount(DOCUMENTS.length);

    await statusFilter.selectOption("APPROVED");
    expect(await cards.count()).toBeGreaterThan(0);
    await statusFilter.selectOption("ALL");
    await expect(cards).toHaveCount(DOCUMENTS.length);

    const listGeometry = await libraryPanel.locator(".knowledge-document-list").evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: getComputedStyle(node).overflowY,
      overflowX: getComputedStyle(node).overflowX,
    }));
    expect(listGeometry.scrollHeight).toBeGreaterThan(listGeometry.clientHeight);
    expect(["auto", "scroll"]).toContain(listGeometry.overflowY);
    expect(listGeometry.overflowX).toBe("hidden");

    if (viewport.width <= 767) {
      for (const control of [titleInput, categorySelect, sourceInput, searchInput, statusFilter]) {
        const fontSize = await control.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
        expect(fontSize).toBeGreaterThanOrEqual(16);
        await expectInsideViewport(control, viewport.width);
      }

      const saveHeight = await saveButton.evaluate((node) => node.getBoundingClientRect().height);
      expect(saveHeight).toBeGreaterThanOrEqual(44);
      await expectInsideViewport(saveButton, viewport.width);

      const approve = cards.first().getByRole("button", { name: "Approve" });
      const reject = cards.first().getByRole("button", { name: "Reject" });
      for (const button of [approve, reject]) {
        const height = await button.evaluate((node) => node.getBoundingClientRect().height);
        expect(height).toBeGreaterThanOrEqual(44);
        await expectInsideViewport(button, viewport.width);
      }

      for (const metric of [metrics.nth(0), metrics.nth(1), metrics.nth(2), metrics.nth(3)]) {
        await expectInsideViewport(metric, viewport.width);
      }
    }

    expect(mutationRequests).toEqual([]);
    await expectNoRootOverflow(page);

    await testInfo.attach(`knowledge-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
