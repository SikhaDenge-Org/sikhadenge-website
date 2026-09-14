import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.DASHBOARD_ADMIN_EMAIL || "admin@example.invalid";
const ADMIN_PASSWORD = process.env.DASHBOARD_ADMIN_PASSWORD || "CI-only-password-12345";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact-desktop", width: 1280, height: 800 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

const BASE_BANK = [
  {
    id: "bank-course",
    source: "BUILT_IN",
    category: "COURSE_DETAILS",
    intent: "COURSE_OVERVIEW",
    questions: ["Become AI Expert course kya hai?", "Course details batao"],
    keywords: ["course", "details", "ai expert"],
    answer: {
      en: "Become AI Expert is SikhaDenge's live online AI-skilling program.",
      hinglish: "Become AI Expert SikhaDenge ka live online AI-skilling program hai.",
    },
    nextQuestion: { en: "Would you like the class schedule?", hinglish: "Class schedule chahiye?" },
    status: "ACTIVE",
    updatedAt: "2026-09-10T08:00:00.000Z",
  },
  {
    id: "bank-schedule",
    source: "BUILT_IN",
    category: "COURSE_SCHEDULE",
    intent: "CLASS_TIMING",
    questions: ["Class timing kya hai?", "Week mein kitni classes hoti hain?"],
    keywords: ["timing", "schedule", "class"],
    answer: {
      en: "Live classes run from 8 PM to 10 PM IST, three times per week on alternate days.",
      hinglish: "Live classes 8 PM se 10 PM IST hoti hain, week mein 3 alternate-day classes hoti hain.",
    },
    nextQuestion: { en: null, hinglish: null },
    status: "ACTIVE",
    updatedAt: "2026-09-10T08:00:00.000Z",
  },
  {
    id: "bank-fees",
    source: "CUSTOM_APPROVED",
    category: "FEES",
    intent: "FEES_QUERY",
    questions: ["Current fees kya hai?", "Scholarship policy kya hai?"],
    keywords: ["fees", "scholarship", "offer"],
    answer: {
      en: "Use the current approved admissions offer shared by the counselling team.",
      hinglish: "Current approved admission offer counselling team ke according share kiya jata hai.",
    },
    nextQuestion: { en: "Would you like the demo link?", hinglish: "Demo link chahiye?" },
    status: "ACTIVE",
    updatedAt: "2026-09-10T08:00:00.000Z",
  },
  {
    id: "bank-career",
    source: "CUSTOM_APPROVED",
    category: "CAREER",
    intent: "CAREER_SCOPE",
    questions: ["AI seekhne ke baad career scope kya hai?", "Beginner join kar sakta hai?"],
    keywords: ["career", "beginner", "job"],
    answer: {
      en: "The program develops practical AI workflows for learners, freelancers and job seekers without guaranteeing employment or income.",
      hinglish: "Program practical AI workflows sikhata hai, lekin job ya income guarantee nahi karta.",
    },
    nextQuestion: { en: null, hinglish: "Aap demo join karna chahenge?" },
    status: "ACTIVE",
    updatedAt: "2026-09-10T08:00:00.000Z",
  },
];

const BANK_ENTRIES = [
  ...BASE_BANK,
  ...Array.from({ length: 20 }, (_, index) => {
    const source = BASE_BANK[index % BASE_BANK.length];
    return {
      ...source,
      id: `bank-volume-${index + 1}`,
      intent: `${source.intent}_${index + 1}`,
      questions: source.questions.map((question) => `${question} variant ${index + 1}`),
      updatedAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T10:00:00.000Z`,
    };
  }),
];

const REVIEW_SUGGESTIONS = Array.from({ length: 12 }, (_, index) => ({
  id: `review-${index + 1}`,
  category: index % 2 === 0 ? "COURSE_DETAILS" : "FEES",
  userQuestion: index % 2 === 0
    ? `Unknown learner question ${index + 1} about the AI Expert program`
    : `Unknown learner question ${index + 1} about fees and scholarship`,
  originalAnswer: index % 3 === 0 ? "I need a human to verify this answer." : null,
  proposedAnswer: "Draft answer pending human review.",
  correctionReason: "Captured for supervised training regression coverage.",
  createdAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T12:00:00.000Z`,
  sourceMessageId: null,
  redactedPayload: { autoCaptured: true },
}));

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

async function expectMinHeight(locator, minimum) {
  const height = await locator.evaluate((node) => node.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(minimum);
}

for (const viewport of VIEWPORTS) {
  test(`Agent Training stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);

    const forbiddenRequests = [];

    await page.route("**/api/agent-training/question-bank**", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            entries: BANK_ENTRIES,
            summary: {
              total: BANK_ENTRIES.length,
              builtIn: BANK_ENTRIES.filter((entry) => entry.source === "BUILT_IN").length,
              customApproved: BANK_ENTRIES.filter((entry) => entry.source === "CUSTOM_APPROVED").length,
            },
          }),
        });
        return;
      }
      forbiddenRequests.push(`${request.method()} ${request.url()}`);
      await route.fulfill({ status: 418, contentType: "application/json", body: JSON.stringify({ error: "Mutation blocked by browser regression." }) });
    });

    await page.route("**/api/learning**", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ suggestions: REVIEW_SUGGESTIONS }),
        });
        return;
      }
      forbiddenRequests.push(`${request.method()} ${request.url()}`);
      await route.fulfill({ status: 418, contentType: "application/json", body: JSON.stringify({ error: "Mutation blocked by browser regression." }) });
    });

    await page.route("**/api/agent/preview**", async (route) => {
      const request = route.request();
      if (request.method() !== "GET") forbiddenRequests.push(`${request.method()} ${request.url()}`);
      await route.fulfill({ status: 418, contentType: "application/json", body: JSON.stringify({ error: "Preview execution blocked by browser regression." }) });
    });

    await page.goto("/training", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/training(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Agent Training", exact: true })).toBeVisible();

    const summary = page.locator('section[aria-label="Agent training summary"]');
    await expect(summary).toBeVisible();
    const manager = summary.locator("xpath=..");
    const metrics = summary.locator(":scope > article");
    await expect(metrics).toHaveCount(4);
    await expect(metrics.nth(0).getByText("Total active answers", { exact: true })).toBeVisible();
    await expect(metrics.nth(3).getByText("Waiting for review", { exact: true })).toBeVisible();

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

    const courseLock = manager.locator(":scope > section").nth(1);
    await expect(courseLock.getByText("Become AI Expert Program", { exact: true })).toBeVisible();
    await expectInsideViewport(courseLock, viewport.width);

    const tabs = manager.getByRole("navigation", { name: "Agent training sections" });
    const tabButtons = tabs.getByRole("button");
    await expect(tabButtons).toHaveCount(5);
    for (let index = 0; index < 5; index += 1) {
      await expectMinHeight(tabButtons.nth(index), 44);
    }

    if (viewport.width <= 767) {
      const tabsGeometry = await tabs.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        overflowX: getComputedStyle(node).overflowX,
      }));
      expect(tabsGeometry.scrollWidth).toBeGreaterThan(tabsGeometry.clientWidth);
      expect(["auto", "scroll"]).toContain(tabsGeometry.overflowX);
    }

    let panel = manager.locator(":scope > section").nth(2);
    await expect(panel.getByRole("heading", { name: "Question Bank" })).toBeVisible();

    const bankSearch = panel.getByPlaceholder("Search question, keyword or answer");
    const bankSelects = panel.locator("select");
    await expect(bankSelects).toHaveCount(2);
    const bankCards = panel.locator("article");
    await expect(bankCards).toHaveCount(BANK_ENTRIES.length);

    const firstCard = bankCards.first();
    await expect(firstCard.getByText("Approved Hinglish reply", { exact: true })).toBeVisible();
    await expect(firstCard.getByText("Approved English reply", { exact: true })).toBeVisible();

    const bankList = firstCard.locator("xpath=..");
    const bankListGeometry = await bankList.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: getComputedStyle(node).overflowY,
      overflowX: getComputedStyle(node).overflowX,
    }));
    expect(bankListGeometry.scrollHeight).toBeGreaterThan(bankListGeometry.clientHeight);
    expect(["auto", "scroll"]).toContain(bankListGeometry.overflowY);
    expect(bankListGeometry.overflowX).toBe("hidden");

    await bankSearch.fill("scholarship");
    const filteredCount = await bankCards.count();
    expect(filteredCount).toBeGreaterThan(0);
    expect(filteredCount).toBeLessThan(BANK_ENTRIES.length);
    await bankSearch.fill("");
    await expect(bankCards).toHaveCount(BANK_ENTRIES.length);

    await bankSelects.nth(0).selectOption("CUSTOM_APPROVED");
    expect(await bankCards.count()).toBeGreaterThan(0);
    await bankSelects.nth(0).selectOption("ALL");
    await expect(bankCards).toHaveCount(BANK_ENTRIES.length);

    if (viewport.width <= 767) {
      for (const control of [bankSearch, bankSelects.nth(0), bankSelects.nth(1)]) {
        const fontSize = await control.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
        expect(fontSize).toBeGreaterThanOrEqual(16);
        await expectInsideViewport(control, viewport.width);
      }

      const hinglish = firstCard.getByText("Approved Hinglish reply", { exact: true }).locator("xpath=..");
      const english = firstCard.getByText("Approved English reply", { exact: true }).locator("xpath=..");
      const hinglishBox = await hinglish.boundingBox();
      const englishBox = await english.boundingBox();
      expect(hinglishBox).not.toBeNull();
      expect(englishBox).not.toBeNull();
      expect(englishBox.y).toBeGreaterThan(hinglishBox.y + hinglishBox.height - 2);
    }

    await tabs.getByRole("button", { name: /Teach Agent/ }).click();
    panel = manager.locator(":scope > section").nth(2);
    await expect(panel.getByRole("heading", { name: "Teach the Agent" })).toBeVisible();
    const category = panel.getByLabel("Category");
    const mainQuestion = panel.getByLabel("Main customer question");
    const alternatives = panel.getByLabel(/Alternative questions/);
    const approvedAnswer = panel.getByLabel("Exact approved WhatsApp reply");
    const trainingNote = panel.getByLabel(/Training note/);
    const saveButton = panel.getByRole("button", { name: "Save for Review" });

    await mainQuestion.fill("Can a complete beginner join this program?");
    await alternatives.fill("Beginner join kar sakta hai?\nCoding zaroori hai kya?");
    await approvedAnswer.fill("Yes. The program is designed for non-technical learners too; no coding prerequisite is required for the core learning path.");
    await trainingNote.fill("UI regression local-state check only.");
    await expectMinHeight(saveButton, 44);

    if (viewport.width <= 767) {
      for (const control of [category, mainQuestion, alternatives, approvedAnswer, trainingNote]) {
        const fontSize = await control.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
        expect(fontSize).toBeGreaterThanOrEqual(16);
        await expectInsideViewport(control, viewport.width);
      }
      await expectInsideViewport(saveButton, viewport.width);
    }

    await tabs.getByRole("button", { name: /Review Queue/ }).click();
    panel = manager.locator(":scope > section").nth(2);
    await expect(panel.getByRole("heading", { name: "Review Queue" })).toBeVisible();
    const reviewCards = panel.locator("article");
    await expect(reviewCards).toHaveCount(REVIEW_SUGGESTIONS.length);
    const reviewTextarea = reviewCards.first().getByPlaceholder("Write the final approved reply here.");
    const rejectButton = reviewCards.first().getByRole("button", { name: "Reject" });
    const approveButton = reviewCards.first().getByRole("button", { name: "Approve & Train" });
    await expectMinHeight(rejectButton, 44);
    await expectMinHeight(approveButton, 44);

    const reviewList = reviewCards.first().locator("xpath=..");
    const reviewListGeometry = await reviewList.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      overflowY: getComputedStyle(node).overflowY,
    }));
    expect(reviewListGeometry.scrollHeight).toBeGreaterThan(reviewListGeometry.clientHeight);
    expect(["auto", "scroll"]).toContain(reviewListGeometry.overflowY);

    if (viewport.width <= 767) {
      const fontSize = await reviewTextarea.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
      expect(fontSize).toBeGreaterThanOrEqual(16);
      for (const control of [reviewTextarea, rejectButton, approveButton]) {
        await expectInsideViewport(control, viewport.width);
      }
    }

    await tabs.getByRole("button", { name: /Test Agent/ }).click();
    panel = manager.locator(":scope > section").nth(2);
    await expect(panel.getByRole("heading", { name: "Test Agent" })).toBeVisible();
    const testTextarea = panel.getByLabel("Customer message");
    const previewButton = panel.getByRole("button", { name: "Generate Safe Preview" });
    await panel.getByRole("button", { name: "Class timing kya hai?" }).click();
    await expect(testTextarea).toHaveValue("Class timing kya hai?");
    await expectMinHeight(previewButton, 44);

    if (viewport.width <= 767) {
      const fontSize = await testTextarea.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
      expect(fontSize).toBeGreaterThanOrEqual(16);
      await expectInsideViewport(testTextarea, viewport.width);
      await expectInsideViewport(previewButton, viewport.width);
    }

    await tabs.getByRole("button", { name: /Chat Flow/ }).click();
    panel = manager.locator(":scope > section").nth(2);
    await expect(panel.getByRole("heading", { name: "Student Chat Flow" })).toBeVisible();
    await expect(panel.getByText("Locked agent rules", { exact: true })).toBeVisible();
    await expect(panel.getByText("Greeting", { exact: true })).toBeVisible();
    await expect(panel.getByText("Supervised learning", { exact: true })).toBeVisible();
    await expectInsideViewport(panel, viewport.width);

    await tabs.getByRole("button", { name: /Question Bank/ }).click();
    panel = manager.locator(":scope > section").nth(2);
    await expect(panel.getByRole("heading", { name: "Question Bank" })).toBeVisible();

    expect(forbiddenRequests).toEqual([]);
    await expectNoRootOverflow(page);

    await testInfo.attach(`training-${viewport.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
