import { expect, test } from "@playwright/test";

const ADMIN_EMAIL =
  process.env.DASHBOARD_ADMIN_EMAIL || "admin@example.invalid";
const ADMIN_PASSWORD =
  process.env.DASHBOARD_ADMIN_PASSWORD || "CI-only-password-12345";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
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
  test(`Contacts stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);

    await page.goto("/contacts", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/contacts(?:\?|$)/);
    await expect(page.locator(".contact-manager")).toBeVisible();
    await expect(page.locator(".contact-metrics > article")).toHaveCount(4);
    await expect(page.locator(".contact-toolbar")).toBeVisible();
    await expect(page.locator(".contact-directory")).toBeVisible();
    await expect(page.locator(".contact-editor")).toBeVisible();

    await expect(page.getByText("Loading customer intelligence…", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Search contacts")).toBeVisible();
    await expect(page.getByLabel("Filter by consent")).toBeVisible();
    await expect(page.getByLabel("Filter by stage")).toBeVisible();

    // Loading a directory must not silently put the editor into an ambiguous
    // create/edit state. Contacts remain unselected until the operator picks one.
    const firstRow = page.locator(".contact-table tbody tr").first();
    await expect(firstRow).toBeVisible();
    await expect(page.locator(".contact-table tbody tr.selected")).toHaveCount(0);
    await expect(page.locator(".contact-editor h3")).toHaveText("Select a contact");
    await expect(
      page.locator(".contact-editor").getByRole("button", { name: "Message" }),
    ).toHaveCount(0);

    await expectNoRootOverflow(page);

    const directoryBox = await page.locator(".contact-directory").boundingBox();
    const editorBox = await page.locator(".contact-editor").boundingBox();
    expect(directoryBox).not.toBeNull();
    expect(editorBox).not.toBeNull();

    if (viewport.width >= 1180) {
      expect(editorBox.x).toBeGreaterThan(directoryBox.x + directoryBox.width - 2);
    } else {
      expect(editorBox.y).toBeGreaterThan(directoryBox.y + directoryBox.height - 2);
    }

    if (viewport.width <= 767) {
      const searchControls = page.locator(
        ".contact-search-v2 input, .contact-filter-row select",
      );
      await expect(searchControls).toHaveCount(3);
      for (let index = 0; index < 3; index += 1) {
        await expectInsideViewport(searchControls.nth(index), viewport.width);
      }

      const actions = page.locator(
        ".contact-toolbar-actions > button, .contact-toolbar-actions > a",
      );
      await expect(actions).toHaveCount(3);
      for (let index = 0; index < 3; index += 1) {
        await expectInsideViewport(actions.nth(index), viewport.width);
      }

      await page
        .locator(".contact-toolbar-actions")
        .getByRole("button", { name: "Add contact" })
        .click();
      await expect(page.locator(".contact-editor h3")).toHaveText("Add contact");

      const formGeometry = await page.locator(".contact-form-grid label").evaluateAll((nodes) =>
        nodes.slice(0, 2).map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, top: rect.top, width: rect.width };
        }),
      );
      expect(formGeometry).toHaveLength(2);
      expect(Math.abs(formGeometry[0].left - formGeometry[1].left)).toBeLessThanOrEqual(2);
      expect(formGeometry[1].top).toBeGreaterThan(formGeometry[0].top);

      const tableWrap = page.locator(".contact-table-wrap");
      await expectInsideViewport(tableWrap, viewport.width);
      const tableGeometry = await tableWrap.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        overflowX: getComputedStyle(node).overflowX,
        overscrollX: getComputedStyle(node).overscrollBehaviorX,
        overscrollY: getComputedStyle(node).overscrollBehaviorY,
      }));
      expect(["auto", "scroll"]).toContain(tableGeometry.overflowX);
      expect(tableGeometry.scrollWidth).toBeGreaterThan(tableGeometry.clientWidth);
      expect(tableGeometry.overscrollX).toBe("contain");
      expect(tableGeometry.overscrollY).toBe("auto");

      // Verify the user can actually move the wide directory horizontally.
      const horizontalScroll = await tableWrap.evaluate((node) => {
        node.scrollLeft = node.scrollWidth;
        return node.scrollLeft;
      });
      expect(horizontalScroll).toBeGreaterThan(0);
    }

    if (viewport.width === 390) {
      const metricBoxes = await page.locator(".contact-metrics > article").evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, top: rect.top, width: rect.width };
        }),
      );
      expect(metricBoxes).toHaveLength(4);
      expect(Math.abs(metricBoxes[0].top - metricBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(metricBoxes[2].top).toBeGreaterThan(metricBoxes[0].top);
      expect(metricBoxes[0].width).toBeGreaterThan(140);
    }

    // Exercise the actual operator state transition on desktop where both the
    // directory and editor are visible together: create → edit → create.
    if (viewport.width >= 1180) {
      await firstRow.click();
      await expect(firstRow).toHaveClass(/selected/);
      await expect(page.locator(".contact-editor h3")).toHaveText("CI Browser Learner");
      await expect(
        page.locator(".contact-editor").getByRole("button", { name: "Message" }),
      ).toBeVisible();

      await page
        .locator(".contact-toolbar-actions")
        .getByRole("button", { name: "Add contact" })
        .click();
      await expect(firstRow).not.toHaveClass(/selected/);
      await expect(page.locator(".contact-editor h3")).toHaveText("Add contact");
      await expect(
        page.locator(".contact-editor").getByRole("button", { name: "Message" }),
      ).toHaveCount(0);
    }

    await expectNoRootOverflow(page);
    await testInfo.attach(`contacts-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
