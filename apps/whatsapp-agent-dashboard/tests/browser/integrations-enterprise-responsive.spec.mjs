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

const PROVIDERS = [
  {
    provider: "META_WHATSAPP",
    label: "WhatsApp Cloud API",
    description: "Cloud API metadata for WhatsApp Business messaging.",
    secretEnvironment: ["META_ACCESS_TOKEN", "META_WABA_ID"],
    externalWriteLock: "WHATSAPP_EXTERNAL_WRITES_ENABLED",
    secrets: [
      { name: "META_ACCESS_TOKEN", configured: true },
      { name: "META_WABA_ID", configured: true },
    ],
    secretsConfigured: true,
    externalWriteEnabled: false,
  },
  {
    provider: "META_INSTAGRAM",
    label: "Instagram",
    description: "Instagram professional account messaging and comment-read metadata.",
    secretEnvironment: ["META_INSTAGRAM_ACCOUNT_ID"],
    externalWriteLock: "INSTAGRAM_EXTERNAL_WRITES_ENABLED",
    secrets: [{ name: "META_INSTAGRAM_ACCOUNT_ID", configured: true }],
    secretsConfigured: true,
    externalWriteEnabled: false,
  },
  {
    provider: "META_MESSENGER",
    label: "Messenger",
    description: "Facebook Page and Messenger conversation metadata.",
    secretEnvironment: ["META_PAGE_ID"],
    externalWriteLock: "MESSENGER_EXTERNAL_WRITES_ENABLED",
    secrets: [{ name: "META_PAGE_ID", configured: false }],
    secretsConfigured: false,
    externalWriteEnabled: false,
  },
  {
    provider: "TELEGRAM",
    label: "Telegram",
    description: "Reserved provider registry metadata for future controlled rollout.",
    secretEnvironment: ["TELEGRAM_BOT_TOKEN"],
    externalWriteLock: "TELEGRAM_EXTERNAL_WRITES_ENABLED",
    secrets: [{ name: "TELEGRAM_BOT_TOKEN", configured: false }],
    secretsConfigured: false,
    externalWriteEnabled: false,
  },
  {
    provider: "EMAIL",
    label: "Email",
    description: "Outbound and inbound email provider metadata.",
    secretEnvironment: ["EMAIL_API_KEY"],
    externalWriteLock: "EMAIL_EXTERNAL_WRITES_ENABLED",
    secrets: [{ name: "EMAIL_API_KEY", configured: true }],
    secretsConfigured: true,
    externalWriteEnabled: false,
  },
  {
    provider: "WEBSITE_CHAT",
    label: "Website Chat",
    description: "Website conversation transport metadata and callback endpoint.",
    secretEnvironment: [],
    externalWriteLock: null,
    secrets: [],
    secretsConfigured: true,
    externalWriteEnabled: false,
  },
  {
    provider: "SMS",
    label: "SMS",
    description: "SMS provider registry metadata with explicit write lock.",
    secretEnvironment: ["SMS_API_KEY"],
    externalWriteLock: "SMS_EXTERNAL_WRITES_ENABLED",
    secrets: [{ name: "SMS_API_KEY", configured: false }],
    secretsConfigured: false,
    externalWriteEnabled: false,
  },
  {
    provider: "CONTACT_FORM",
    label: "Contact Form",
    description: "Website lead-form ingestion metadata.",
    secretEnvironment: [],
    externalWriteLock: null,
    secrets: [],
    secretsConfigured: true,
    externalWriteEnabled: false,
  },
];

const CONFIGURATIONS = Array.from({ length: 18 }, (_, index) => {
  const provider = PROVIDERS[index % PROVIDERS.length];
  return {
    id: `integration-${index + 1}`,
    provider: provider.provider,
    name: `${provider.label} operational configuration ${index + 1}`,
    enabled: index % 3 !== 0,
    endpointUrl: `https://example.invalid/integrations/${index + 1}`,
    accountReference: `account-reference-${index + 1}-long-operational-value`,
    notes: `Read-only browser regression configuration ${index + 1}.`,
    status: index % 4 === 0 ? "DEGRADED" : "READY",
    lastTestedAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T08:00:00.000Z`,
    lastTestResult: index % 4 === 0 ? "Dry-run requires provider verification" : "Dry-run passed without external writes",
  };
});

const HEALTH = [
  {
    provider: "META_WHATSAPP",
    externalAccountId: "waba-regression-001",
    status: "CONNECTED",
    evidence: {
      apiVerifiedAt: "2026-09-11T02:00:00.000Z",
      webhookRequired: true,
      webhookVerifiedAt: "2026-09-11T02:02:00.000Z",
      permissionsVerified: true,
    },
    updatedAt: "2026-09-11T02:03:00.000Z",
  },
  {
    provider: "META_INSTAGRAM",
    externalAccountId: "ig-regression-001",
    status: "DEGRADED",
    evidence: {
      apiVerifiedAt: "2026-09-11T02:00:00.000Z",
      webhookRequired: true,
      webhookVerifiedAt: null,
      permissionsVerified: true,
    },
    updatedAt: "2026-09-11T02:03:00.000Z",
  },
  {
    provider: "META_MESSENGER",
    externalAccountId: "page-regression-001",
    status: "CONNECTING",
    evidence: {
      apiVerifiedAt: null,
      webhookRequired: true,
      webhookVerifiedAt: null,
      permissionsVerified: false,
    },
    updatedAt: "2026-09-11T02:03:00.000Z",
  },
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

async function expectMinHeight(locator, minimum = 44) {
  const height = await locator.evaluate((node) => node.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(minimum);
}

for (const viewport of VIEWPORTS) {
  test(`Integrations workspace stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);

    const forbiddenRequests = [];

    await page.route("https://connect.facebook.net/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "window.FB={init:function(){},login:function(){}};if(window.fbAsyncInit){window.fbAsyncInit();}",
      });
    });

    await page.route("**/api/integrations**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() !== "GET") {
        forbiddenRequests.push(`${request.method()} ${url.pathname}`);
        await route.fulfill({
          status: 418,
          contentType: "application/json",
          body: JSON.stringify({ error: "Integration mutation blocked by browser regression." }),
        });
        return;
      }

      if (url.pathname === "/api/integrations/health") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ health: HEALTH }),
        });
        return;
      }

      if (url.pathname === "/api/integrations") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            providers: PROVIDERS,
            configurations: CONFIGURATIONS,
            externalWritesGloballyEnabled: false,
            generatedAt: "2026-09-11T02:00:00.000Z",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected read-only integration route in browser regression." }),
      });
    });

    await page.goto("/integrations", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/integrations(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Integrations & Developer API" })).toBeVisible();

    const root = page.locator(".integrations-enterprise-root");
    await expect(root).toBeVisible();

    const healthGrid = root.locator(":scope > .integrations-health-grid");
    const healthCards = healthGrid.locator(":scope > .suite-card");
    await expect(healthCards).toHaveCount(3);
    await expect(healthCards.nth(0).getByRole("heading", { name: "Evidence-backed provider state" })).toBeVisible();
    await expect(healthCards.nth(1).getByRole("heading", { name: "Verify manage-comments permission safely" })).toBeVisible();
    await expect(healthCards.nth(2).getByRole("heading", { name: "Verify Page messaging and comment reads safely" })).toBeVisible();

    const healthBoxes = await healthCards.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }));

    if (viewport.width > 1280) {
      expect(Math.abs(healthBoxes[0].top - healthBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(Math.abs(healthBoxes[0].top - healthBoxes[2].top)).toBeLessThanOrEqual(2);
    } else if (viewport.width > 900) {
      expect(healthBoxes[1].top).toBeGreaterThan(healthBoxes[0].top);
      expect(Math.abs(healthBoxes[1].top - healthBoxes[2].top)).toBeLessThanOrEqual(2);
    } else {
      expect(healthBoxes[1].top).toBeGreaterThan(healthBoxes[0].top);
      expect(healthBoxes[2].top).toBeGreaterThan(healthBoxes[1].top);
    }

    const verifyButtons = healthGrid.getByRole("button");
    await expect(verifyButtons).toHaveCount(5);
    for (let index = 0; index < 5; index += 1) {
      await expectMinHeight(verifyButtons.nth(index));
    }

    const manager = root.locator(":scope > .suite-stack");
    await expect(manager).toBeVisible();

    const metrics = manager.locator(":scope > .suite-metrics > article");
    await expect(metrics).toHaveCount(4);
    await expect(metrics.nth(0).getByText("Providers", { exact: true })).toBeVisible();
    await expect(metrics.nth(1).getByText("Configurations", { exact: true })).toBeVisible();
    await expect(metrics.nth(2).getByText("Secret-ready", { exact: true })).toBeVisible();
    await expect(metrics.nth(3).getByText("External writes", { exact: true })).toBeVisible();

    const metricBoxes = await metrics.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width };
    }));

    if (viewport.width > 1280) {
      for (let index = 1; index < metricBoxes.length; index += 1) {
        expect(Math.abs(metricBoxes[index].top - metricBoxes[0].top)).toBeLessThanOrEqual(2);
      }
    } else {
      expect(Math.abs(metricBoxes[0].top - metricBoxes[1].top)).toBeLessThanOrEqual(2);
      expect(metricBoxes[2].top).toBeGreaterThan(metricBoxes[0].top);
      expect(Math.abs(metricBoxes[2].top - metricBoxes[3].top)).toBeLessThanOrEqual(2);
    }

    const connectHeading = manager.getByRole("heading", { name: "Connect WhatsApp" });
    await expect(connectHeading).toBeVisible();
    const connectButton = manager.getByRole("button", { name: "Connect WhatsApp" });
    await expect(connectButton).toBeVisible();
    await expect(connectButton).toBeEnabled();
    await expectMinHeight(connectButton);

    const registryGrid = manager.locator(":scope > .suite-grid.two");
    const registryForm = registryGrid.locator(":scope > form.suite-card");
    const readinessCard = registryGrid.locator(":scope > .suite-card").nth(1);
    await expect(registryForm).toBeVisible();
    await expect(readinessCard).toBeVisible();

    const registryBox = await registryForm.boundingBox();
    const readinessBox = await readinessCard.boundingBox();
    expect(registryBox).not.toBeNull();
    expect(readinessBox).not.toBeNull();
    if (viewport.width > 1180) {
      expect(readinessBox.x).toBeGreaterThan(registryBox.x + registryBox.width - 2);
      expect(Math.abs(readinessBox.y - registryBox.y)).toBeLessThanOrEqual(2);
    } else {
      expect(readinessBox.y).toBeGreaterThan(registryBox.y + registryBox.height - 2);
    }

    const providerSelect = registryForm.getByLabel("Provider");
    const nameInput = registryForm.getByLabel("Configuration name");
    const endpointInput = registryForm.getByLabel("HTTPS endpoint");
    const accountInput = registryForm.getByLabel("Account reference");
    const notesInput = registryForm.getByLabel("Notes");
    const metadataCheckbox = registryForm.getByLabel("Enable configuration metadata");
    const saveButton = registryForm.getByRole("button", { name: "Save configuration" });

    await nameInput.fill("CI read-only integration draft");
    await endpointInput.fill("https://example.invalid/ci-read-only-endpoint");
    await accountInput.fill("ci-account-reference");
    await notesInput.fill("Local React state only; browser regression never submits this form.");
    await providerSelect.selectOption("META_INSTAGRAM");
    await metadataCheckbox.check();
    await expectMinHeight(saveButton);

    const readinessList = readinessCard.locator(".integration-provider-list");
    await expect(readinessList.locator(":scope > article")).toHaveCount(PROVIDERS.length);
    const readinessGeometry = await readinessList.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: getComputedStyle(node).overflowY,
      overflowX: getComputedStyle(node).overflowX,
    }));
    expect(readinessGeometry.scrollHeight).toBeGreaterThan(readinessGeometry.clientHeight);
    expect(["auto", "scroll"]).toContain(readinessGeometry.overflowY);
    expect(readinessGeometry.overflowX).toBe("hidden");

    const savedCard = manager.locator(":scope > .suite-card").last();
    await expect(savedCard.getByRole("heading", { name: "Integration controls and dry-run validation" })).toBeVisible();
    const savedRows = savedCard.locator(".suite-list > article");
    await expect(savedRows).toHaveCount(CONFIGURATIONS.length);
    const savedList = savedCard.locator(".suite-list");
    const savedGeometry = await savedList.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: getComputedStyle(node).overflowY,
      overflowX: getComputedStyle(node).overflowX,
    }));
    expect(savedGeometry.scrollHeight).toBeGreaterThan(savedGeometry.clientHeight);
    expect(["auto", "scroll"]).toContain(savedGeometry.overflowY);
    expect(savedGeometry.overflowX).toBe("hidden");

    const firstSavedRow = savedRows.first();
    const editButton = firstSavedRow.getByRole("button", { name: "Edit" });
    const dryRunButton = firstSavedRow.getByRole("button", { name: "Dry-run test" });
    await expectMinHeight(editButton);
    await expectMinHeight(dryRunButton);

    if (viewport.width <= 767) {
      for (const control of [providerSelect, nameInput, endpointInput, accountInput, notesInput]) {
        const fontSize = await control.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
        expect(fontSize).toBeGreaterThanOrEqual(16);
        await expectInsideViewport(control, viewport.width);
      }

      for (const control of [connectButton, saveButton, editButton, dryRunButton]) {
        await expectMinHeight(control);
        await expectInsideViewport(control, viewport.width);
      }

      for (let index = 0; index < 5; index += 1) {
        await expectInsideViewport(verifyButtons.nth(index), viewport.width);
      }

      for (let index = 0; index < 4; index += 1) {
        await expectInsideViewport(metrics.nth(index), viewport.width);
      }
    }

    expect(forbiddenRequests).toEqual([]);
    await expectNoRootOverflow(page);

    await testInfo.attach(`integrations-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
