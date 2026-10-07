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
  test(`Template Studio stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await login(page);
    await page.goto("/templates", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/templates(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Template Studio" })).toBeVisible();

    const studio = page.locator(".template-studio");
    await expect(studio).toBeVisible();

    const metrics = studio.locator(":scope > .template-metrics > article");
    await expect(metrics).toHaveCount(4);
    await expect(metrics.nth(0).getByText("Total templates", { exact: true })).toBeVisible();
    await expect(metrics.nth(1).getByText("Approved", { exact: true })).toBeVisible();
    await expect(metrics.nth(2).getByText("Pending review", { exact: true })).toBeVisible();
    await expect(metrics.nth(3).getByText("Rejected", { exact: true })).toBeVisible();

    const layout = studio.locator(":scope > .template-studio-layout");
    const editor = layout.locator(":scope > .template-editor");
    const preview = layout.locator(":scope > .template-preview-card");
    await expect(editor.getByRole("heading", { name: "Create approval-ready template" })).toBeVisible();
    await expect(preview.getByRole("heading", { name: "WhatsApp message" })).toBeVisible();

    const metricBoxes = await metrics.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, left: rect.left, width: rect.width };
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

    const layoutBoxes = await Promise.all([
      editor.boundingBox(),
      preview.boundingBox(),
    ]);
    expect(layoutBoxes[0]).not.toBeNull();
    expect(layoutBoxes[1]).not.toBeNull();
    if (viewport.width > 1180) {
      expect(layoutBoxes[1].x).toBeGreaterThan(layoutBoxes[0].x + layoutBoxes[0].width - 2);
    } else {
      expect(layoutBoxes[1].y).toBeGreaterThan(layoutBoxes[0].y + layoutBoxes[0].height - 2);
    }

    const formFields = editor.locator(".template-form-grid > label");
    await expect(formFields).toHaveCount(4);
    const formBoxes = await formFields.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, left: rect.left };
      }),
    );
    if (viewport.width > 820) {
      expect(Math.abs(formBoxes[0].top - formBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(formBoxes[2].top).toBeGreaterThan(formBoxes[0].top);
    } else {
      for (let index = 1; index < formBoxes.length; index += 1) {
        expect(formBoxes[index].top).toBeGreaterThan(formBoxes[index - 1].top);
      }
    }

    await editor.getByLabel("Header type").selectOption("TEXT");
    await expect(editor.getByLabel("Header text")).toBeVisible();
    await editor.getByLabel("Header text").fill("Free AI Masterclass");
    await editor.getByLabel("Message body").fill("Hi {{1}}, your SikhaDenge session is ready.");
    await expect(editor.getByText("Variable samples for Meta review", { exact: true })).toBeVisible();
    await editor.locator(".template-variable-grid input").fill("Ankit");
    await expect(preview.getByText("Free AI Masterclass", { exact: true })).toBeVisible();
    await expect(preview.getByText("Hi Ankit, your SikhaDenge session is ready.", { exact: true })).toBeVisible();

    const library = studio.locator(":scope > .template-library");
    await expect(library.getByRole("heading", { name: "Drafts and Meta approval statuses" })).toBeVisible();
    await expect(library.getByPlaceholder("Search templates")).toBeVisible();
    await expect(library.getByRole("button", { name: "Sync Meta status" })).toBeVisible();
    await expect(library.getByText("ci_browser_template", { exact: true })).toBeVisible();
    await expect(library.getByText("APPROVED", { exact: true })).toBeVisible();

    await library.getByPlaceholder("Search templates").fill("ci_browser_template");
    await expect(library.getByText("ci_browser_template", { exact: true })).toBeVisible();
    await library.getByRole("combobox").selectOption("APPROVED");
    await expect(library.getByText("ci_browser_template", { exact: true })).toBeVisible();

    if (viewport.width <= 560) {
      const templateName = editor.getByLabel("Template name");
      const language = editor.getByLabel("Language");
      const messageBody = editor.getByLabel("Message body");
      const search = library.getByPlaceholder("Search templates");
      const status = library.getByRole("combobox");
      for (const control of [templateName, language, messageBody, search, status]) {
        const fontSize = await control.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
        expect(fontSize).toBeGreaterThanOrEqual(16);
        await expectInsideViewport(control, viewport.width);
      }

      const addButton = editor.getByRole("button", { name: "+ Add button" });
      const saveDraft = editor.getByRole("button", { name: "Save draft" });
      const saveSubmit = editor.getByRole("button", { name: "Save & submit to Meta" });
      const syncButton = library.getByRole("button", { name: "Sync Meta status" });
      const removeButton = editor.getByRole("button", { name: "Remove button 1" });
      for (const control of [addButton, saveDraft, saveSubmit, syncButton, removeButton]) {
        const height = await control.evaluate((node) => node.getBoundingClientRect().height);
        expect(height).toBeGreaterThanOrEqual(44);
        await expectInsideViewport(control, viewport.width);
      }

      const buttonRow = editor.locator(".template-button-row").first();
      await expectInsideViewport(buttonRow, viewport.width);

      const tableWrap = library.locator(".template-table-wrap");
      const tableGeometry = await tableWrap.evaluate((node) => ({
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
      await tableWrap.evaluate((node) => {
        node.scrollLeft = Math.min(160, node.scrollWidth - node.clientWidth);
      });
      expect(await tableWrap.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    }

    await expectNoRootOverflow(page);
    await testInfo.attach(`templates-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
