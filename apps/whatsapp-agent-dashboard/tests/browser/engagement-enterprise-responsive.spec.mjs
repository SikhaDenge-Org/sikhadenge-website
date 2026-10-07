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
  test(`Engagement workspace stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);

    await page.goto("/engagement", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/engagement(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Forms, Appointments & Payments" })).toBeVisible();
    await expect(page.locator(".suite-stack")).toBeVisible();

    const metrics = page.locator(".suite-stack > .suite-metrics > article");
    await expect(metrics).toHaveCount(4);
    await expect(page.getByText("Active forms", { exact: true })).toBeVisible();
    await expect(page.getByText("Submissions", { exact: true })).toBeVisible();
    await expect(page.getByText("Upcoming appointments", { exact: true })).toBeVisible();
    await expect(page.getByText("Pending payments", { exact: true })).toBeVisible();

    const forms = page.locator("form.suite-card");
    await expect(forms).toHaveCount(3);
    const formBuilder = forms.nth(0);
    const appointmentForm = forms.nth(1);
    const paymentForm = forms.nth(2);

    await expect(formBuilder.getByRole("heading", { name: "Create a structured student form" })).toBeVisible();
    await expect(appointmentForm.getByRole("heading", { name: "Schedule demo or counselling" })).toBeVisible();
    await expect(paymentForm.getByRole("heading", { name: "Record fee collection and payment state" })).toBeVisible();

    await expect(formBuilder.locator(".suite-field-row")).toHaveCount(2);
    await formBuilder.getByRole("button", { name: "Add field" }).click();
    await expect(formBuilder.locator(".suite-field-row")).toHaveCount(3);
    await expect(formBuilder.getByRole("button", { name: "Save draft" })).toBeVisible();
    await expect(appointmentForm.getByRole("button", { name: "Schedule appointment" })).toBeVisible();
    await expect(paymentForm.getByRole("button", { name: "Create payment record" })).toBeVisible();

    const paymentFields = paymentForm.locator(".suite-form-grid.four > label");
    await expect(paymentFields).toHaveCount(6);

    const scheduleCards = page.locator(".suite-stack > .suite-grid.two").last().locator(":scope > .suite-card");
    await expect(scheduleCards).toHaveCount(2);
    await expect(scheduleCards.nth(0).getByRole("heading", { name: "Appointments" })).toBeVisible();
    await expect(scheduleCards.nth(1).getByRole("heading", { name: "Recent payment records" })).toBeVisible();

    const metricBoxes = await metrics.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width };
      }),
    );

    expect(metricBoxes).toHaveLength(4);
    if (viewport.width > 1100) {
      for (let index = 1; index < metricBoxes.length; index += 1) {
        expect(Math.abs(metricBoxes[index].top - metricBoxes[0].top)).toBeLessThanOrEqual(2);
      }
    } else {
      expect(Math.abs(metricBoxes[0].top - metricBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(metricBoxes[2].top).toBeGreaterThan(metricBoxes[0].top);
      expect(Math.abs(metricBoxes[2].top - metricBoxes[3].top)).toBeLessThanOrEqual(2);
    }

    const creationGrid = page.locator(".suite-stack > .suite-grid.two").first();
    const creationCards = creationGrid.locator(":scope > .suite-card");
    const builderBox = await creationCards.nth(0).boundingBox();
    const appointmentBox = await creationCards.nth(1).boundingBox();
    expect(builderBox).not.toBeNull();
    expect(appointmentBox).not.toBeNull();

    if (viewport.width > 1100) {
      expect(appointmentBox.x).toBeGreaterThan(builderBox.x + builderBox.width - 2);
      expect(Math.abs(appointmentBox.y - builderBox.y)).toBeLessThanOrEqual(2);
    } else {
      expect(appointmentBox.y).toBeGreaterThan(builderBox.y + builderBox.height - 2);
    }

    const paymentFieldBoxes = await paymentFields.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width };
      }),
    );

    expect(paymentFieldBoxes).toHaveLength(6);
    if (viewport.width === 1440) {
      expect(Math.abs(paymentFieldBoxes[0].top - paymentFieldBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(Math.abs(paymentFieldBoxes[0].top - paymentFieldBoxes[2].top)).toBeLessThanOrEqual(2);
      expect(paymentFieldBoxes[3].top).toBeGreaterThan(paymentFieldBoxes[0].top);
    } else if (viewport.width > 767) {
      expect(Math.abs(paymentFieldBoxes[0].top - paymentFieldBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(paymentFieldBoxes[2].top).toBeGreaterThan(paymentFieldBoxes[0].top);
    } else {
      for (let index = 1; index < paymentFieldBoxes.length; index += 1) {
        expect(paymentFieldBoxes[index].top).toBeGreaterThan(paymentFieldBoxes[index - 1].top);
      }
    }

    if (viewport.width <= 767) {
      const mobileControls = page.locator(
        ".suite-stack input:not([type='checkbox']), .suite-stack select, .suite-stack textarea, .suite-stack button",
      );
      const controlCount = await mobileControls.count();
      expect(controlCount).toBeGreaterThan(10);
      for (let index = 0; index < controlCount; index += 1) {
        if (await mobileControls.nth(index).isVisible()) {
          await expectInsideViewport(mobileControls.nth(index), viewport.width);
        }
      }

      const formNameSize = await page.getByLabel("Form name").evaluate(
        (node) => Number.parseFloat(getComputedStyle(node).fontSize),
      );
      expect(formNameSize).toBeGreaterThanOrEqual(16);

      const fieldRowDisplay = await formBuilder.locator(".suite-field-row").first().evaluate(
        (node) => getComputedStyle(node).display,
      );
      expect(fieldRowDisplay).toBe("grid");
    }

    await expectNoRootOverflow(page);
    await testInfo.attach(`engagement-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
