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

const USERS = Array.from({ length: 18 }, (_, index) => ({
  id: `admin-user-${index + 1}`,
  name: index === 0 ? "CI Security Administrator" : `Operations User ${index + 1}`,
  email: index === 0 ? "security-admin@example.invalid" : `ops-${index + 1}@example.invalid`,
  role: index === 0 ? "ADMIN" : index % 4 === 0 ? "MANAGER" : index % 3 === 0 ? "ANALYST" : "COUNSELOR",
  isActive: index % 7 !== 0,
  lastLoginAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T08:30:00.000Z`,
  createdAt: "2026-08-01T08:00:00.000Z",
  _count: {
    sessions: (index % 4) + 1,
    assignedConversations: index * 3 + 2,
    assignedLeads: index * 2 + 1,
  },
}));

const SESSIONS = Array.from({ length: 36 }, (_, index) => ({
  id: `session-${index + 1}`,
  userId: USERS[index % USERS.length].id,
  expiresAt: `2026-09-${String((index % 9) + 12).padStart(2, "0")}T18:00:00.000Z`,
  lastSeenAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T10:15:00.000Z`,
  revokedAt: index % 10 === 0 ? "2026-09-10T10:00:00.000Z" : null,
  ipAddress: index % 5 === 0 ? null : `192.0.2.${(index % 200) + 1}`,
  userAgent: "CI browser regression agent",
  createdAt: "2026-09-01T08:00:00.000Z",
  user: {
    name: USERS[index % USERS.length].name,
    email: USERS[index % USERS.length].email,
  },
}));

const AUDIT_LOGS = Array.from({ length: 44 }, (_, index) => ({
  id: `audit-${index + 1}`,
  action: index % 3 === 0 ? "USER_ROLE_UPDATED" : index % 3 === 1 ? "SESSION_REVOKED" : "LOGIN_POLICY_CHECKED",
  entityType: index % 2 === 0 ? "DashboardUser" : "DashboardSession",
  entityId: `entity-${index + 1}`,
  ipAddress: `198.51.100.${(index % 200) + 1}`,
  createdAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T09:00:00.000Z`,
  actor: index % 8 === 0 ? null : { name: "CI Security Administrator", email: "security-admin@example.invalid" },
}));

const OVERVIEW = {
  users: USERS,
  sessions: SESSIONS,
  loginAttempts: [
    { email: "blocked@example.invalid", ipAddress: "203.0.113.10", succeeded: false, createdAt: "2026-09-11T02:00:00.000Z" },
    { email: "security-admin@example.invalid", ipAddress: "203.0.113.11", succeeded: true, createdAt: "2026-09-11T02:10:00.000Z" },
  ],
  auditLogs: AUDIT_LOGS,
  metrics: {
    users: USERS.length,
    activeUsers: USERS.filter((user) => user.isActive).length,
    admins: USERS.filter((user) => user.role === "ADMIN").length,
    activeSessions: SESSIONS.filter((session) => !session.revokedAt).length,
    failedLogins24h: 7,
    distinctFailureIps: 3,
  },
  controls: {
    outboundLive: false,
    whatsappWritesEnabled: false,
    instagramWritesEnabled: false,
    messengerWritesEnabled: false,
    sessionRotationEnabled: true,
    auditLoggingEnabled: true,
    roleChecksEnabled: true,
    csrfProtectionEnabled: true,
  },
};

async function login(page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Work Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/inbox(?:\?|$)/);
}

async function expectMinHeight(locator, minimum = 44) {
  const height = await locator.evaluate((node) => node.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(minimum);
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

for (const viewport of VIEWPORTS) {
  test(`Admin workspace stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);

    const forbiddenRequests = [];

    await page.route("**/api/admin/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() !== "GET") {
        forbiddenRequests.push(`${request.method()} ${url.pathname}`);
        await route.fulfill({
          status: 418,
          contentType: "application/json",
          body: JSON.stringify({ error: "Admin mutation blocked by browser regression." }),
        });
        return;
      }

      if (url.pathname === "/api/admin/overview") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(OVERVIEW),
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unexpected read-only admin route in browser regression." }),
      });
    });

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/admin(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Admin & Security" })).toBeVisible();

    const root = page.locator(".admin-enterprise-root");
    await expect(root).toBeVisible();
    const manager = root.locator(":scope > .suite-stack");
    await expect(manager).toBeVisible();

    const metrics = manager.locator(":scope > .suite-metrics > article");
    await expect(metrics).toHaveCount(4);
    await expect(metrics.nth(0).getByText("Active users", { exact: true })).toBeVisible();
    await expect(metrics.nth(1).getByText("Active sessions", { exact: true })).toBeVisible();
    await expect(metrics.nth(2).getByText("Failed logins 24h", { exact: true })).toBeVisible();
    await expect(metrics.nth(3).getByText("Critical outbound", { exact: true })).toBeVisible();

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

    const setupGrid = manager.locator(":scope > .suite-grid.two").first();
    const createForm = setupGrid.locator(":scope > form.suite-card");
    const safetyCard = setupGrid.locator(":scope > .suite-card").nth(1);
    await expect(createForm).toBeVisible();
    await expect(safetyCard).toBeVisible();

    const createBox = await createForm.boundingBox();
    const safetyBox = await safetyCard.boundingBox();
    expect(createBox).not.toBeNull();
    expect(safetyBox).not.toBeNull();
    if (viewport.width > 1180) {
      expect(safetyBox.x).toBeGreaterThan(createBox.x + createBox.width - 2);
      expect(Math.abs(safetyBox.y - createBox.y)).toBeLessThanOrEqual(2);
    } else {
      expect(safetyBox.y).toBeGreaterThan(createBox.y + createBox.height - 2);
    }

    const nameInput = createForm.getByLabel("Name");
    const emailInput = createForm.getByLabel("Email");
    const passwordInput = createForm.getByLabel("Initial password");
    const createRole = createForm.getByLabel("Role");
    const createButton = createForm.getByRole("button", { name: "Create user" });

    await nameInput.fill("CI Local Draft User");
    await emailInput.fill("ci-local-draft@example.invalid");
    await passwordInput.fill("LocalDraftPassword123");
    await createRole.selectOption("ANALYST");
    await expectMinHeight(createButton);

    const safetyControls = safetyCard.locator(".security-control-grid > article");
    await expect(safetyControls).toHaveCount(Object.keys(OVERVIEW.controls).length);

    const usersCard = manager.locator(":scope > .suite-card").filter({ hasText: "Access, workload and session control" });
    await expect(usersCard).toBeVisible();
    const userList = usersCard.locator(".admin-user-list");
    const userRows = userList.locator(":scope > article");
    await expect(userRows).toHaveCount(USERS.length);

    const userListGeometry = await userList.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: getComputedStyle(node).overflowY,
      overflowX: getComputedStyle(node).overflowX,
    }));
    expect(userListGeometry.scrollHeight).toBeGreaterThan(userListGeometry.clientHeight);
    expect(["auto", "scroll"]).toContain(userListGeometry.overflowY);
    expect(userListGeometry.overflowX).toBe("hidden");

    const firstUser = userRows.first();
    const userRole = firstUser.locator("select");
    const deactivateButton = firstUser.getByRole("button", { name: /Deactivate|Activate/ });
    const resetButton = firstUser.getByRole("button", { name: "Reset password" });
    const revokeButton = firstUser.getByRole("button", { name: "Revoke sessions" });

    for (const control of [userRole, deactivateButton, resetButton, revokeButton]) {
      await expectMinHeight(control);
    }

    await resetButton.click();
    const dialog = page.getByRole("dialog", { name: /Reset password for CI Security Administrator/ });
    await expect(dialog).toBeVisible();
    const newPassword = dialog.getByLabel("New password", { exact: true });
    const confirmPassword = dialog.getByLabel("Confirm new password", { exact: true });
    const cancelReset = dialog.getByRole("button", { name: "Cancel" });
    const submitReset = dialog.getByRole("button", { name: "Reset & revoke sessions" });
    await newPassword.fill("AnotherLocalPassword123");
    await confirmPassword.fill("AnotherLocalPassword123");
    await expectMinHeight(cancelReset);
    await expectMinHeight(submitReset);

    if (viewport.width <= 767) {
      for (const control of [nameInput, emailInput, passwordInput, createRole, userRole, newPassword, confirmPassword]) {
        const fontSize = await control.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
        expect(fontSize).toBeGreaterThanOrEqual(16);
        await expectInsideViewport(control, viewport.width);
      }

      for (const control of [createButton, deactivateButton, resetButton, revokeButton, cancelReset, submitReset]) {
        await expectMinHeight(control);
        await expectInsideViewport(control, viewport.width);
      }

      for (let index = 0; index < 4; index += 1) {
        await expectInsideViewport(metrics.nth(index), viewport.width);
      }
    }

    await cancelReset.click();
    await expect(dialog).toBeHidden();

    const activityGrid = manager.locator(":scope > .suite-grid.two").last();
    const activityCards = activityGrid.locator(":scope > .suite-card");
    await expect(activityCards).toHaveCount(2);
    const sessionsCard = activityCards.nth(0);
    const auditCard = activityCards.nth(1);
    await expect(sessionsCard.getByRole("heading", { name: "Recent authenticated activity" })).toBeVisible();
    await expect(auditCard.getByRole("heading", { name: "Latest privileged operations" })).toBeVisible();

    const activityBoxes = await activityCards.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }));
    if (viewport.width > 900) {
      expect(activityBoxes[1].left).toBeGreaterThan(activityBoxes[0].left + activityBoxes[0].width - 2);
      expect(Math.abs(activityBoxes[1].top - activityBoxes[0].top)).toBeLessThanOrEqual(2);
    } else {
      expect(activityBoxes[1].top).toBeGreaterThan(activityBoxes[0].top + activityBoxes[0].height - 2);
    }

    const sessionList = sessionsCard.locator(".suite-list.compact");
    const auditList = auditCard.locator(".suite-list.compact");
    await expect(sessionList.locator(":scope > article")).toHaveCount(30);
    await expect(auditList.locator(":scope > article")).toHaveCount(40);

    for (const list of [sessionList, auditList]) {
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

    expect(forbiddenRequests).toEqual([]);
    await expectNoRootOverflow(page);

    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await page.waitForTimeout(50);
    await testInfo.attach(`admin-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
