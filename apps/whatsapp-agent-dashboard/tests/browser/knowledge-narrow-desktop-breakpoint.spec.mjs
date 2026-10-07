import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.DASHBOARD_ADMIN_EMAIL || "admin@example.invalid";
const ADMIN_PASSWORD = process.env.DASHBOARD_ADMIN_PASSWORD || "CI-only-password-12345";

async function login(page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Work Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/inbox(?:\?|$)/);
}

test("Knowledge stacks before fixed desktop tracks can clip at narrow desktop", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1190, height: 800 });
  await login(page);

  const mutations = [];
  await page.route("**/api/knowledge/documents**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ documents: [] }),
      });
      return;
    }

    mutations.push(`${request.method()} ${request.url()}`);
    await route.fulfill({
      status: 418,
      contentType: "application/json",
      body: JSON.stringify({ error: "Mutation blocked by breakpoint regression." }),
    });
  });

  await page.goto("/knowledge", { waitUntil: "domcontentloaded" });
  const manager = page.locator(".knowledge-manager");
  await expect(manager).toBeVisible();

  const metrics = manager.locator(":scope > .knowledge-summary-row > article");
  await expect(metrics).toHaveCount(4);
  const metricBoxes = await metrics.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top };
  }));
  expect(Math.abs(metricBoxes[0].top - metricBoxes[1].top)).toBeLessThanOrEqual(2);
  expect(metricBoxes[2].top).toBeGreaterThan(metricBoxes[0].top);
  expect(Math.abs(metricBoxes[2].top - metricBoxes[3].top)).toBeLessThanOrEqual(2);

  const formPanel = manager.locator(".knowledge-form-panel");
  const libraryPanel = manager.locator(".knowledge-library-panel");
  const formBox = await formPanel.boundingBox();
  const libraryBox = await libraryPanel.boundingBox();
  expect(formBox).not.toBeNull();
  expect(libraryBox).not.toBeNull();
  expect(libraryBox.y).toBeGreaterThan(formBox.y + formBox.height - 2);

  const geometry = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 2);
  expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.innerWidth + 2);
  expect(mutations).toEqual([]);
});
