import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.DASHBOARD_ADMIN_EMAIL || "admin@example.invalid";
const ADMIN_PASSWORD = process.env.DASHBOARD_ADMIN_PASSWORD || "CI-only-password-12345";

async function login(page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Work Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/inbox(?:\?|$)/);
  await expect(page.locator(".sx-inbox")).toBeVisible();
}

async function ensureChat(page) {
  const chat = page.locator(".sx-chat");
  if (await chat.isVisible()) return;
  const first = page.locator(".sx-convo").first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(chat).toBeVisible();
}

async function expectNoRootOverflow(page) {
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(geometry.html).toBeLessThanOrEqual(geometry.viewport + 2);
  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 2);
}

async function shot(page, testInfo, name) {
  const body = await page.screenshot({ fullPage: false });
  await testInfo.attach(name, { body, contentType: "image/png" });
}

test("mobile Inbox keeps composer and standard five-tab dock inside the viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await ensureChat(page);

  const composer = page.locator(".sx-composer");
  const composerRow = page.locator(".sx-composer-row");
  const send = page.locator(".sx-send");
  const nav = page.locator(".sx-inbox > .sx-side");
  const context = page.locator(".sx-context");

  await expect(composer).toBeVisible();
  await expect(composerRow).toBeVisible();
  await expect(send).toBeVisible();
  await expect(nav).toBeVisible();

  await expect.poll(async () => composer.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      right: Math.round(rect.right),
    };
  })).toEqual({ left: 0, right: 390 });

  const geometry = await page.evaluate(() => {
    const composerNode = document.querySelector(".sx-composer");
    const navNode = document.querySelector(".sx-inbox > .sx-side");
    const sendNode = document.querySelector(".sx-send");
    const contextNode = document.querySelector(".sx-context");
    if (!(composerNode instanceof HTMLElement) ||
        !(navNode instanceof HTMLElement) ||
        !(sendNode instanceof HTMLElement) ||
        !(contextNode instanceof HTMLElement)) {
      throw new Error("Inbox completion geometry nodes missing");
    }
    const composerRect = composerNode.getBoundingClientRect();
    const navRect = navNode.getBoundingClientRect();
    const sendRect = sendNode.getBoundingClientRect();
    const contextRect = contextNode.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      composer: {
        top: composerRect.top,
        bottom: composerRect.bottom,
        left: composerRect.left,
        right: composerRect.right,
      },
      nav: {
        top: navRect.top,
        bottom: navRect.bottom,
        left: navRect.left,
        right: navRect.right,
      },
      send: {
        top: sendRect.top,
        bottom: sendRect.bottom,
        left: sendRect.left,
        right: sendRect.right,
      },
      context: {
        left: contextRect.left,
        right: contextRect.right,
      },
    };
  });

  expect(geometry.nav.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.nav.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.nav.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.nav.top).toBeGreaterThanOrEqual(geometry.viewportHeight - 66);

  expect(geometry.composer.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.composer.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.composer.top).toBeGreaterThan(0);
  expect(geometry.composer.bottom).toBeLessThanOrEqual(geometry.nav.top + 1);
  expect(geometry.composer.bottom).toBeGreaterThanOrEqual(geometry.nav.top - 2);

  expect(geometry.send.left).toBeGreaterThanOrEqual(geometry.composer.left);
  expect(geometry.send.right).toBeLessThanOrEqual(geometry.composer.right + 1);
  expect(geometry.send.bottom).toBeLessThanOrEqual(geometry.composer.bottom + 1);

  expect(geometry.context.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.context.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  const destinations = await page.locator(
    ".sx-side-scroll .rail-button, .sx-side-foot > .sx-navitem",
  ).evaluateAll((nodes) => nodes.flatMap((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    if (style.display === "none" || rect.width < 1 || rect.height < 1) return [];
    const label = node.querySelector(".sx-navlabel");
    return [{
      title: node.getAttribute("aria-label") || node.textContent?.trim() || "unknown",
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      labelClientWidth: label instanceof HTMLElement ? label.clientWidth : 0,
      labelScrollWidth: label instanceof HTMLElement ? label.scrollWidth : 0,
    }];
  }));

  expect(destinations.map((item) => item.title)).toEqual([
    "Inbox",
    "Contacts",
    "Leads",
    "Campaigns",
    "Settings",
  ]);

  for (const item of destinations) {
    expect(item.left, `${item.title} starts outside viewport`).toBeGreaterThanOrEqual(-1);
    expect(item.right, `${item.title} ends outside viewport`).toBeLessThanOrEqual(391);
    expect(item.width, `${item.title} touch lane is too narrow`).toBeGreaterThanOrEqual(60);
    expect(item.height, `${item.title} touch lane is too short`).toBeGreaterThanOrEqual(48);
    expect(item.labelScrollWidth, `${item.title} label is clipped`).toBeLessThanOrEqual(item.labelClientWidth + 1);
  }

  await expectNoRootOverflow(page);
  await shot(page, testInfo, "mobile-inbox-enterprise-complete-390");
});

test("tablet Inbox keeps identity and conversation actions in clean rows", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await login(page);
  await ensureChat(page);

  const values = await page.evaluate(() => {
    const head = document.querySelector(".sx-chat-head");
    const person = document.querySelector(".sx-chat-person");
    const actions = document.querySelector(".sx-chat-actions");
    if (!(head instanceof HTMLElement) || !(person instanceof HTMLElement) || !(actions instanceof HTMLElement)) {
      throw new Error("Tablet chat geometry nodes missing");
    }
    const h = head.getBoundingClientRect();
    const p = person.getBoundingClientRect();
    const a = actions.getBoundingClientRect();
    return {
      head: { left: h.left, right: h.right, width: h.width, scrollWidth: head.scrollWidth },
      person: { left: p.left, right: p.right, top: p.top, bottom: p.bottom },
      actions: { left: a.left, right: a.right, top: a.top, bottom: a.bottom },
    };
  });

  expect(values.head.scrollWidth).toBeLessThanOrEqual(values.head.width + 2);
  expect(values.actions.left).toBeGreaterThanOrEqual(values.head.left - 1);
  expect(values.actions.right).toBeLessThanOrEqual(values.head.right + 1);
  expect(values.actions.top).toBeGreaterThanOrEqual(values.person.bottom - 2);

  for (const control of await page.locator(".sx-chat-actions :is(button, label)").evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  )) {
    expect(control.left).toBeGreaterThanOrEqual(values.head.left - 1);
    expect(control.right).toBeLessThanOrEqual(values.head.right + 1);
  }

  await expectNoRootOverflow(page);
  await shot(page, testInfo, "tablet-inbox-enterprise-complete-1024");
});

test("desktop Inbox preserves the four-column enterprise workspace", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await ensureChat(page);

  const layout = await page.locator(".sx-inbox").evaluate((root) => {
    const list = root.querySelector(".sx-list");
    const chat = root.querySelector(".sx-chat");
    const details = root.querySelector(".sx-details");
    if (!(list instanceof HTMLElement) || !(chat instanceof HTMLElement) || !(details instanceof HTMLElement)) {
      throw new Error("Desktop Inbox columns missing");
    }
    const l = list.getBoundingClientRect();
    const c = chat.getBoundingClientRect();
    const d = details.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      list: { left: l.left, right: l.right },
      chat: { left: c.left, right: c.right },
      details: { left: d.left, right: d.right },
    };
  });

  expect(layout.list.right).toBeLessThanOrEqual(layout.chat.left + 1);
  expect(layout.chat.right).toBeLessThanOrEqual(layout.details.left + 1);
  expect(layout.details.right).toBeLessThanOrEqual(layout.viewport + 1);
  await expect(page.locator(".sx-composer")).toBeVisible();
  await expect(page.locator(".sx-details")).toBeVisible();
  await expectNoRootOverflow(page);
  await shot(page, testInfo, "desktop-inbox-enterprise-complete-1440");
});