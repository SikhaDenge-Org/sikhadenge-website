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

const STATUS = {
  policy: {
    webhookAnalysisEnabled: true,
    autoReplyEnabled: false,
    immediateDispatchEnabled: false,
    runtimeEnabled: true,
    killSwitchActive: false,
    modelCallsEnabled: true,
    outboundMode: "disabled",
    liveAutoReplyReady: false,
  },
  conversations: {
    aiMode: 38,
    pendingReview: 7,
  },
  recent: {
    analyzed: 72,
    queued: 14,
    sent: 0,
    handoffs: 11,
    failed: 3,
  },
  sampleSize: 100,
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

function boxesByTop(boxes, tolerance = 2) {
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
  test(`Settings runtime workspace stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);

    const forbiddenRequests = [];
    let statusReads = 0;

    await page.route("**/api/agent/live/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() !== "GET") {
        forbiddenRequests.push(`${request.method()} ${url.pathname}`);
        await route.fulfill({
          status: 418,
          contentType: "application/json",
          body: JSON.stringify({ error: "Agent mutation blocked by Settings browser regression." }),
        });
        return;
      }

      if (url.pathname === "/api/agent/live/status") {
        statusReads += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(STATUS),
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected read-only agent route in Settings regression." }),
      });
    });

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/settings(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    const root = page.locator(".settings-enterprise-root");
    await expect(root).toBeVisible();
    const manager = root.locator(".live-agent-manager");
    await expect(manager).toBeVisible();
    await expect.poll(() => statusReads).toBeGreaterThanOrEqual(1);

    const summary = manager.locator(".live-agent-summary");
    const summaryCards = summary.locator(":scope > article");
    await expect(summaryCards).toHaveCount(4);
    await expect(summaryCards.nth(0)).toContainText("Webhook analysis");
    await expect(summaryCards.nth(1)).toContainText("AI auto-reply");
    await expect(summaryCards.nth(2)).toContainText("Immediate dispatch");
    await expect(summaryCards.nth(3)).toContainText("Outbound mode");

    const summaryBoxes = await summaryCards.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }));
    const summaryRows = boxesByTop(summaryBoxes);
    if (viewport.width > 1280) {
      expect(summaryRows).toHaveLength(1);
      expect(summaryRows[0].boxes).toHaveLength(4);
    } else {
      expect(summaryRows).toHaveLength(2);
      expect(summaryRows[0].boxes).toHaveLength(2);
      expect(summaryRows[1].boxes).toHaveLength(2);
    }

    const lifecycle = manager.locator(".live-agent-card").nth(0);
    await expect(lifecycle.getByRole("heading", { name: "Inbound analysis, memory and human handoff" })).toBeVisible();
    const refresh = lifecycle.getByRole("button", { name: "Refresh status" });
    const refreshHeight = await refresh.evaluate((node) => node.getBoundingClientRect().height);
    expect(refreshHeight).toBeGreaterThanOrEqual(44);

    const gates = lifecycle.locator(".live-agent-gates > div");
    await expect(gates).toHaveCount(4);
    const gateBoxes = await gates.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }));
    const gateRows = boxesByTop(gateBoxes);
    if (viewport.width > 1280) {
      expect(gateRows).toHaveLength(1);
      expect(gateRows[0].boxes).toHaveLength(4);
    } else {
      expect(gateRows).toHaveLength(2);
      expect(gateRows[0].boxes).toHaveLength(2);
      expect(gateRows[1].boxes).toHaveLength(2);
    }

    const beforeRefresh = statusReads;
    await refresh.click();
    await expect.poll(() => statusReads).toBeGreaterThan(beforeRefresh);
    await expect(refresh).toBeEnabled();

    const operational = manager.locator(".live-agent-card").nth(1);
    await expect(operational.getByRole("heading", { name: "AI conversations and review queue" })).toBeVisible();
    await expect(operational).toContainText("latest 100 inbound agent events");

    const metrics = operational.locator(".live-agent-metrics > article");
    await expect(metrics).toHaveCount(7);
    const metricBoxes = await metrics.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }));
    const metricRows = boxesByTop(metricBoxes);

    if (viewport.width > 1280) {
      expect(metricRows).toHaveLength(1);
      expect(metricRows[0].boxes).toHaveLength(7);
    } else if (viewport.width > 767) {
      expect(metricRows).toHaveLength(2);
      expect(metricRows[0].boxes).toHaveLength(4);
      expect(metricRows[1].boxes).toHaveLength(3);
    } else {
      expect(metricRows).toHaveLength(4);
      expect(metricRows[0].boxes).toHaveLength(2);
      expect(metricRows[1].boxes).toHaveLength(2);
      expect(metricRows[2].boxes).toHaveLength(2);
      expect(metricRows[3].boxes).toHaveLength(1);
    }

    if (viewport.width <= 767) {
      for (let index = 0; index < 4; index += 1) {
        await expectInsideViewport(summaryCards.nth(index), viewport.width);
        await expectInsideViewport(gates.nth(index), viewport.width);
      }
      for (let index = 0; index < 7; index += 1) {
        await expectInsideViewport(metrics.nth(index), viewport.width);
      }
      await expectInsideViewport(refresh, viewport.width);
    }

    expect(forbiddenRequests).toEqual([]);
    await expectNoRootOverflow(page);

    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await page.waitForTimeout(50);
    await testInfo.attach(`settings-${viewport.name}-top`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });

    await operational.scrollIntoViewIfNeeded();
    await page.waitForTimeout(50);
    await testInfo.attach(`settings-${viewport.name}-operations`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
