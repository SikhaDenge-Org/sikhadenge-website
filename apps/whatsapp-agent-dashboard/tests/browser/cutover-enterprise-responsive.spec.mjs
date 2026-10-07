import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const ADMIN_EMAIL = process.env.DASHBOARD_ADMIN_EMAIL || "admin@example.invalid";
const ADMIN_PASSWORD = process.env.DASHBOARD_ADMIN_PASSWORD || "CI-only-password-12345";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact-desktop", width: 1280, height: 800 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

const statuses = ["PASS", "PENDING", "MANUAL", "BLOCKED"];

const CHECKS = [
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `meta-${index + 1}`,
    group: "Meta account",
    label: index === 0
      ? "System-user access token configured for production ownership"
      : `Meta account readiness control ${index + 1}`,
    status: statuses[index % statuses.length],
    detail: `Production account evidence ${index + 1} remains explicit, auditable and safe for supervised cutover review without exposing secret values.`,
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `webhook-${index + 1}`,
    group: "Webhooks",
    label: `Webhook evidence control ${index + 1}`,
    status: statuses[(index + 1) % statuses.length],
    detail: `Verified inbound ownership evidence ${index + 1} is evaluated independently from outbound activation.`,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `phone-${index + 1}`,
    group: "Phone migration",
    label: `Phone migration control ${index + 1}`,
    status: statuses[(index + 2) % statuses.length],
    detail: `Phone registration checkpoint ${index + 1} requires supervised production verification.`,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `provider-${index + 1}`,
    group: "Provider ownership",
    label: `Provider ownership control ${index + 1}`,
    status: statuses[(index + 3) % statuses.length],
    detail: `Previous-provider retirement checkpoint ${index + 1} remains fail-closed until owned traffic evidence exists.`,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `messaging-${index + 1}`,
    group: "Messaging",
    label: `Messaging activation control ${index + 1}`,
    status: statuses[index % statuses.length],
    detail: `Manual, AI, campaign and automation sending remain independently gated at checkpoint ${index + 1}.`,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `operations-${index + 1}`,
    group: "Operations",
    label: `Operations control ${index + 1}`,
    status: statuses[(index + 1) % statuses.length],
    detail: `Operational rollback and observability evidence ${index + 1} is required before irreversible provider retirement.`,
  })),
];

const INVENTORY = Object.fromEntries(
  Array.from({ length: 16 }, (_, index) => [`productionInventoryMetric${index + 1}`, (index + 1) * 7]),
);

const CONSTRAINTS = Object.fromEntries(
  Array.from({ length: 14 }, (_, index) => [`supervisedSafetyConstraint${index + 1}`, index % 3 !== 0]),
);

const READINESS = {
  readyForSupervisedCutover: false,
  readyForAutomaticCutover: false,
  cutoverExecuted: false,
  metaConnected: false,
  outboundMode: "disabled",
  checks: CHECKS,
  summary: { passed: 8, pending: 7, manual: 6, blocked: 8 },
  inventory: INVENTORY,
  constraints: CONSTRAINTS,
  generatedAt: "2026-09-11T12:00:00.000Z",
};

async function login(page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Work Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/inbox(?:\?|$)/);
}

async function expectInsideViewport(locator, viewportWidth) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth + 1);
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

function rowGroups(boxes, tolerance = 2) {
  const groups = [];
  for (const box of boxes) {
    let group = groups.find((entry) => Math.abs(entry.top - box.top) <= tolerance);
    if (!group) {
      group = { top: box.top, boxes: [] };
      groups.push(group);
    }
    group.boxes.push(box);
  }
  return groups.sort((a, b) => a.top - b.top);
}

for (const viewport of VIEWPORTS) {
  test(`Cutover readiness stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);

    const forbiddenRequests = [];
    let readinessReads = 0;

    await page.route("**/api/cutover/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() !== "GET") {
        forbiddenRequests.push(`${request.method()} ${url.pathname}`);
        await route.fulfill({
          status: 418,
          contentType: "application/json",
          body: JSON.stringify({ error: "Cutover mutation blocked by browser regression." }),
        });
        return;
      }

      if (url.pathname === "/api/cutover/readiness") {
        readinessReads += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(READINESS),
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected read-only Cutover route in browser regression." }),
      });
    });

    await page.goto("/cutover", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/cutover(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Meta Cutover Readiness" })).toBeVisible();

    const root = page.locator(".cutover-enterprise-root");
    await expect(root).toBeVisible();
    const stack = root.locator(":scope > .suite-stack");
    await expect(stack).toBeVisible();
    await expect.poll(() => readinessReads).toBeGreaterThanOrEqual(1);

    const banner = stack.locator(":scope > .cutover-banner");
    await expect(banner).toContainText("Cutover remains blocked");
    const auditButton = banner.getByRole("button", { name: "Run audit again" });
    const auditButtonHeight = await auditButton.evaluate((node) => node.getBoundingClientRect().height);
    expect(auditButtonHeight).toBeGreaterThanOrEqual(44);

    const beforeRefresh = readinessReads;
    await auditButton.click();
    await expect.poll(() => readinessReads).toBeGreaterThan(beforeRefresh);
    await expect(auditButton).toBeEnabled();

    const metrics = stack.locator(":scope > .suite-metrics > article");
    await expect(metrics).toHaveCount(4);
    const metricBoxes = await metrics.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }));
    const metricRows = rowGroups(metricBoxes);
    if (viewport.width > 1280) {
      expect(metricRows).toHaveLength(1);
      expect(metricRows[0].boxes).toHaveLength(4);
    } else {
      expect(metricRows).toHaveLength(2);
      expect(metricRows[0].boxes).toHaveLength(2);
      expect(metricRows[1].boxes).toHaveLength(2);
    }

    const readinessGrid = stack.locator(":scope > .suite-grid.two").filter({ has: page.locator(".cutover-check-list") }).first();
    const groupCards = readinessGrid.locator(":scope > .suite-card");
    await expect(groupCards).toHaveCount(6);

    const firstTwoBoxes = await groupCards.nth(0).evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }).then(async (first) => {
      const second = await groupCards.nth(1).evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      });
      return [first, second];
    });

    if (viewport.width > 1180) {
      expect(firstTwoBoxes[1].left).toBeGreaterThan(firstTwoBoxes[0].left + firstTwoBoxes[0].width - 2);
      expect(Math.abs(firstTwoBoxes[1].top - firstTwoBoxes[0].top)).toBeLessThanOrEqual(2);
    } else {
      expect(firstTwoBoxes[1].top).toBeGreaterThan(firstTwoBoxes[0].top + firstTwoBoxes[0].height - 2);
    }

    const metaList = groupCards.nth(0).locator(".cutover-check-list");
    await expect(metaList.locator(":scope > article")).toHaveCount(12);
    const metaGeometry = await metaList.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: getComputedStyle(node).overflowY,
      overflowX: getComputedStyle(node).overflowX,
    }));
    expect(metaGeometry.scrollHeight).toBeGreaterThan(metaGeometry.clientHeight);
    expect(["auto", "scroll"]).toContain(metaGeometry.overflowY);
    expect(metaGeometry.overflowX).toBe("hidden");

    const inventoryGrid = stack.locator(":scope > .suite-grid.two").filter({ has: page.locator(".suite-list.compact") }).last();
    const inventoryCards = inventoryGrid.locator(":scope > .suite-card");
    await expect(inventoryCards).toHaveCount(2);
    const inventoryBoxes = await inventoryCards.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }));
    if (viewport.width > 900) {
      expect(inventoryBoxes[1].left).toBeGreaterThan(inventoryBoxes[0].left + inventoryBoxes[0].width - 2);
      expect(Math.abs(inventoryBoxes[1].top - inventoryBoxes[0].top)).toBeLessThanOrEqual(2);
    } else {
      expect(inventoryBoxes[1].top).toBeGreaterThan(inventoryBoxes[0].top + inventoryBoxes[0].height - 2);
    }

    const inventoryList = inventoryCards.nth(0).locator(".suite-list.compact");
    const constraintList = inventoryCards.nth(1).locator(".suite-list.compact");
    await expect(inventoryList.locator(":scope > article")).toHaveCount(16);
    await expect(constraintList.locator(":scope > article")).toHaveCount(14);

    for (const list of [inventoryList, constraintList]) {
      const geometry = await list.evaluate((node) => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        overflowY: getComputedStyle(node).overflowY,
        overflowX: getComputedStyle(node).overflowX,
      }));
      expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
      expect(["auto", "scroll"]).toContain(geometry.overflowY);
      expect(geometry.overflowX).toBe("hidden");
    }

    if (viewport.width <= 767) {
      await expectInsideViewport(banner, viewport.width);
      await expectInsideViewport(auditButton, viewport.width);
      for (let index = 0; index < 4; index += 1) {
        await expectInsideViewport(metrics.nth(index), viewport.width);
      }
      await expectInsideViewport(groupCards.nth(0), viewport.width);
      const firstEvidence = metaList.locator(":scope > article").first();
      await expectInsideViewport(firstEvidence, viewport.width);
      const evidenceFontSize = await firstEvidence.locator("p").evaluate(
        (node) => Number.parseFloat(getComputedStyle(node).fontSize),
      );
      expect(evidenceFontSize).toBeGreaterThanOrEqual(11);
    }

    expect(forbiddenRequests).toEqual([]);
    await expectNoRootOverflow(page);

    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await page.waitForTimeout(50);
    await testInfo.attach(`cutover-${viewport.name}-top`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });

    await inventoryGrid.scrollIntoViewIfNeeded();
    await page.waitForTimeout(50);
    await testInfo.attach(`cutover-${viewport.name}-inventory`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
