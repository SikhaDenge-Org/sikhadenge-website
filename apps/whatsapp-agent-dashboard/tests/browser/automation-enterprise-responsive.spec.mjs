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

const NOW = "2026-09-10T12:00:00.000Z";
const MOCK_FLOW = {
  flowId: "ci-browser-flow",
  name: "CI Lead Qualification Flow",
  description: "Deterministic browser-only automation fixture",
  status: "DRAFT",
  version: 3,
  nodes: [
    {
      id: "ci-trigger",
      kind: "TRIGGER",
      type: "NEW_LEAD",
      label: "New Lead",
      config: {},
    },
    {
      id: "ci-wait",
      kind: "ACTION",
      type: "WAIT",
      label: "Wait 60 minutes",
      config: { minutes: 60 },
    },
    {
      id: "ci-end",
      kind: "ACTION",
      type: "END",
      label: "End",
      config: {},
    },
  ],
  createdAt: NOW,
  updatedAt: NOW,
  lastValidatedAt: NOW,
  lastSimulationAt: null,
};

async function login(page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Work Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/inbox(?:\?|$)/);
}

async function installReadOnlyAutomationFixtures(page) {
  await page.route("**/api/automation/flows", async (route) => {
    if (route.request().method() !== "GET") {
      await route.abort("blockedbyclient");
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        flows: [MOCK_FLOW],
        runtime: {
          runtimeEnabled: false,
          actionExecutionEnabled: false,
          outboundMode: "disabled",
          externalActionsReady: false,
        },
      }),
    });
  });

  await page.route("**/api/automation/flows/*/graph", async (route) => {
    if (route.request().method() !== "GET") {
      await route.abort("blockedbyclient");
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        flowId: MOCK_FLOW.flowId,
        sourceFlowVersion: MOCK_FLOW.version,
        draft: {
          flowId: MOCK_FLOW.flowId,
          sourceFlowVersion: MOCK_FLOW.version,
          graph: {
            nodes: MOCK_FLOW.nodes.map((node) => ({
              id: node.id,
              type: node.type,
              config: node.config,
            })),
            edges: [
              { id: "edge-1", from: "ci-trigger", to: "ci-wait" },
              { id: "edge-2", from: "ci-wait", to: "ci-end" },
            ],
          },
          updatedAt: NOW,
        },
        draftPersisted: true,
        draftStale: false,
        publishedVersions: [
          {
            sourceFlowVersion: 2,
            publishedAt: "2026-09-09T12:00:00.000Z",
            publishedBy: "ci-admin",
          },
        ],
      }),
    });
  });
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

async function metricGeometry(locator) {
  return locator.evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }),
  );
}

function expectFourOrTwoByTwo(boxes, viewportWidth) {
  expect(boxes).toHaveLength(4);
  if (viewportWidth > 1280) {
    for (let index = 1; index < boxes.length; index += 1) {
      expect(Math.abs(boxes[index].top - boxes[0].top)).toBeLessThanOrEqual(2);
    }
    return;
  }
  expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThanOrEqual(2);
  expect(boxes[2].top).toBeGreaterThan(boxes[0].top);
  expect(Math.abs(boxes[2].top - boxes[3].top)).toBeLessThanOrEqual(2);
}

for (const viewport of VIEWPORTS) {
  test(`Automation workspace stays enterprise-usable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(140_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);
    await installReadOnlyAutomationFixtures(page);

    let mutationRequests = 0;
    page.on("request", (request) => {
      if (
        request.url().includes("/api/automation/") &&
        request.method() !== "GET"
      ) {
        mutationRequests += 1;
      }
    });

    await page.goto("/automation", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/automation(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Automation & Flow Builder" })).toBeVisible();

    const route = page.locator(".automation-enterprise-route");
    await expect(route).toBeVisible();

    const masterclass = route.locator(":scope > .mc-panel");
    await expect(masterclass).toBeVisible();
    await expect(masterclass.getByRole("heading", { name: "Free AI Expert Masterclass Flow" })).toBeVisible();

    const masterclassMetrics = masterclass.locator(":scope > .mc-metrics > article");
    await expect(masterclassMetrics).toHaveCount(4);
    expectFourOrTwoByTwo(await metricGeometry(masterclassMetrics), viewport.width);

    const runtimeItems = masterclass.locator(":scope > .mc-runtime-strip > span");
    await expect(runtimeItems).toHaveCount(4);

    const masterclassGrid = masterclass.locator(":scope > .mc-grid");
    const editor = masterclassGrid.locator(":scope > .mc-editor-card");
    const metaApproval = masterclassGrid.locator(":scope > .mc-template-card");
    await expect(editor).toBeVisible();
    await expect(metaApproval).toBeVisible();

    const editorBox = await editor.boundingBox();
    const approvalBox = await metaApproval.boundingBox();
    expect(editorBox).not.toBeNull();
    expect(approvalBox).not.toBeNull();
    if (viewport.width > 1180) {
      expect(approvalBox.x).toBeGreaterThan(editorBox.x + editorBox.width - 2);
      expect(Math.abs(approvalBox.y - editorBox.y)).toBeLessThanOrEqual(2);
    } else {
      expect(approvalBox.y).toBeGreaterThan(editorBox.y + editorBox.height - 2);
    }

    const mediaPicker = masterclass.locator(".mc-image-picker").first();
    await expect(mediaPicker).toBeVisible();
    const mediaSurface = await mediaPicker.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(mediaSurface).toBe("rgb(248, 250, 252)");

    await testInfo.attach(`automation-${viewport.name}-top`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });

    const builder = route.locator(":scope > .automation-builder");
    await builder.scrollIntoViewIfNeeded();
    await expect(builder).toBeVisible();
    const builderMetrics = builder.locator(":scope > .automation-metrics > article");
    await expect(builderMetrics).toHaveCount(4);
    expectFourOrTwoByTwo(await metricGeometry(builderMetrics), viewport.width);

    const workspace = builder.locator(":scope > .automation-workspace");
    const library = workspace.locator(":scope > .automation-library");
    const flowEditor = workspace.locator(":scope > .automation-editor");
    await expect(library.getByText("CI Lead Qualification Flow", { exact: true })).toBeVisible();
    await expect(flowEditor.getByRole("heading", { name: "CI Lead Qualification Flow" })).toBeVisible();

    const libraryBox = await library.boundingBox();
    const flowEditorBox = await flowEditor.boundingBox();
    expect(libraryBox).not.toBeNull();
    expect(flowEditorBox).not.toBeNull();
    if (viewport.width > 1180) {
      expect(flowEditorBox.x).toBeGreaterThan(libraryBox.x + libraryBox.width - 2);
      expect(Math.abs(flowEditorBox.y - libraryBox.y)).toBeLessThanOrEqual(2);
    } else {
      expect(flowEditorBox.y).toBeGreaterThan(libraryBox.y + libraryBox.height - 2);
    }

    const newFlow = library.getByRole("button", { name: "New flow" });
    await newFlow.click();
    await expect(flowEditor.getByRole("heading", { name: "New automation flow" })).toBeVisible();
    await expect(flowEditor.locator(".automation-node")).toHaveCount(2);

    const addAction = flowEditor.getByRole("button", { name: "Add action" });
    await addAction.click();
    await expect(flowEditor.locator(".automation-node")).toHaveCount(3);

    const graph = route.locator(":scope > .graph-workspace-card");
    await graph.scrollIntoViewIfNeeded();
    await expect(graph.getByRole("heading", { name: "Automation graph publish & simulator" })).toBeVisible();
    const graphMetrics = graph.locator(".graph-workspace-metrics > article");
    await expect(graphMetrics).toHaveCount(4);
    expectFourOrTwoByTwo(await metricGeometry(graphMetrics), viewport.width);

    const graphNodes = graph.locator(".graph-node-strip > .graph-node-tile");
    await expect(graphNodes).toHaveCount(3);
    await expect(graph.getByRole("button", { name: "Sync graph draft" })).toBeVisible();
    await expect(graph.getByRole("button", { name: "Dry-run graph" })).toBeVisible();
    await expect(graph.getByRole("button", { name: "Publish immutable version" })).toBeVisible();

    if (viewport.width <= 720) {
      const formInput = masterclass.locator(".mc-form-grid input").first();
      const nodeInput = flowEditor.locator(".automation-node-grid input").first();
      const graphSelect = graph.locator(".graph-workspace-header select");
      for (const control of [formInput, nodeInput, graphSelect]) {
        const fontSize = await control.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
        expect(fontSize).toBeGreaterThanOrEqual(16);
        await expectInsideViewport(control, viewport.width);
      }

      const touchControls = [
        masterclass.locator(".mc-flow-switch"),
        masterclass.getByRole("button", { name: "Save flow" }),
        newFlow,
        addAction,
        flowEditor.locator(".automation-node-actions button").last(),
        graph.getByRole("button", { name: "Sync graph draft" }),
      ];
      for (const control of touchControls) {
        const height = await control.evaluate((node) => node.getBoundingClientRect().height);
        expect(height).toBeGreaterThanOrEqual(44);
        await expectInsideViewport(control, viewport.width);
      }

      const graphStrip = graph.locator(".graph-node-strip");
      const stripGeometry = await graphStrip.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        overflowX: getComputedStyle(node).overflowX,
      }));
      expect(stripGeometry.scrollWidth).toBeGreaterThan(stripGeometry.clientWidth);
      expect(["auto", "scroll"]).toContain(stripGeometry.overflowX);
    }

    await expectNoRootOverflow(page);
    expect(mutationRequests).toBe(0);

    await testInfo.attach(`automation-${viewport.name}-graph`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
