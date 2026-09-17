import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const stage = process.env.AUDIT_STAGE;
const root = process.env.AUDIT_ROOT;
const port = Number(process.env.AUDIT_PORT || "3110");
const reportDir = process.env.AUDIT_OUT;
const slug = process.env.AUDIT_SLUG || "chatgpt-se-resume-kaise-banaye";
const databaseUrl = process.env.DATABASE_URL;

if (!stage || !root || !reportDir || !databaseUrl) {
  console.error("Missing AUDIT_STAGE, AUDIT_ROOT, AUDIT_OUT, or DATABASE_URL.");
  process.exit(2);
}

fs.mkdirSync(reportDir, { recursive: true });

const baseUrl = `http://127.0.0.1:${port}`;
const auditUrl = `${baseUrl}/blog/${slug}`;
const serverLogPath = path.join(reportDir, "server.log");
const resultPath = path.join(reportDir, "responsive-audit.json");
const summaryPath = path.join(reportDir, "responsive-audit.txt");
const serverLog = fs.openSync(serverLogPath, "w");

const server = spawn(path.join(root, "node_modules", ".bin", "next"), ["start", "-p", String(port)], {
  cwd: stage,
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: ["ignore", serverLog, serverLog],
});

let browser;
let closed = false;

async function stopServer() {
  if (closed) return;
  closed = true;

  if (!server.killed) {
    server.kill("SIGTERM");
  }

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!server.killed) server.kill("SIGKILL");
      resolve();
    }, 5000);

    server.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  fs.closeSync(serverLog);
}

async function waitForServer() {
  let lastError = "";

  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(auditUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });

      if (response.status === 200) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Isolated server was not ready: ${lastError}`);
}

function isVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

const viewports = [
  { name: "mobile", width: 390, height: 844, expectedSidebar: false },
  { name: "tablet", width: 768, height: 1024, expectedSidebar: false },
  { name: "desktop", width: 1440, height: 1000, expectedSidebar: true },
];

const outputLines = [];
const results = [];
let failures = 0;

function line(value = "") {
  outputLines.push(String(value));
  console.log(value);
}

try {
  await waitForServer();
  line("ISOLATED_SERVER_READY=YES");

  const browserExecutable = process.env.PLAYWRIGHT_EXECUTABLE_PATH || chromium.executablePath();
  line(`PLAYWRIGHT_EXECUTABLE=${browserExecutable}`);
  browser = await chromium.launch({
    headless: true,
    executablePath: browserExecutable,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  for (const viewport of viewports) {
    const pageErrors = [];
    const consoleErrors = [];
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    const response = await page.goto(auditUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    await page.waitForTimeout(800);

    const metrics = await page.evaluate(({ expectedSidebar }) => {
      const main = document.querySelector("main");
      const header = main?.querySelector(":scope > header") || document.querySelector("main > header");
      const h1 = document.querySelector("h1");
      const faqItems = [...document.querySelectorAll("#faq details")];
      const faqSummaries = [...document.querySelectorAll("#faq summary")];
      const sectionNav = document.querySelector('nav[aria-label="Article sections"]');
      const quickAnswer = document.querySelector("#quick-answer");
      const article = document.querySelector("article");
      const bodyStyle = window.getComputedStyle(document.body);
      const mainStyle = main ? window.getComputedStyle(main) : null;
      const headerStyle = header ? window.getComputedStyle(header) : null;
      const h1Style = h1 ? window.getComputedStyle(h1) : null;
      const viewportWidth = document.documentElement.clientWidth;
      const documentWidth = Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      );
      const overflowElements = [...document.querySelectorAll("body *")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.right > viewportWidth + 1 || rect.left < -1;
        })
        .slice(0, 20)
        .map((element) => ({
          tag: element.tagName,
          className: String(element.className || "").slice(0, 180),
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
        }));
      const tapHeights = faqSummaries.map((element) => Math.round(element.getBoundingClientRect().height));
      const sectionNavVisible = (() => {
        if (!sectionNav) return false;
        const style = window.getComputedStyle(sectionNav);
        const rect = sectionNav.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })();
      const articleWidth = article ? Math.round(article.getBoundingClientRect().width) : 0;
      const quickAnswerWidth = quickAnswer ? Math.round(quickAnswer.getBoundingClientRect().width) : 0;

      return {
        expectedSidebar,
        viewportWidth,
        documentWidth,
        bodyOverflowX: bodyStyle.overflowX,
        overflowElements,
        h1Count: document.querySelectorAll("h1").length,
        h1TextLength: h1?.textContent?.trim().length || 0,
        h1FontSize: h1Style?.fontSize || "",
        h1LineHeight: h1Style?.lineHeight || "",
        mainBackground: mainStyle?.backgroundColor || "",
        headerBackground: headerStyle?.backgroundColor || "",
        faqCount: faqItems.length,
        minimumFaqTapHeight: tapHeights.length ? Math.min(...tapHeights) : 0,
        quickAnswerPresent: Boolean(quickAnswer),
        editorialLinkPresent: Boolean(document.querySelector('a[href="/editorial-policy"]')),
        authorLinkPresent: Boolean(document.querySelector('a[href="/authors/sikhadenge-editorial-team"]')),
        sectionNavVisible,
        articleWidth,
        quickAnswerWidth,
      };
    }, { expectedSidebar: viewport.expectedSidebar });

    const status = response?.status() || 0;
    const checks = {
      http200: status === 200,
      singleH1: metrics.h1Count === 1,
      h1Readable: metrics.h1TextLength > 10,
      noHorizontalOverflow: metrics.documentWidth <= metrics.viewportWidth + 1 && metrics.overflowElements.length === 0,
      lightMain: metrics.mainBackground === "rgb(247, 248, 251)",
      lightHeader: metrics.headerBackground === "rgb(255, 255, 255)",
      faqPresent: metrics.faqCount > 0,
      faqTapTarget: metrics.minimumFaqTapHeight >= 44,
      quickAnswerPresent: metrics.quickAnswerPresent,
      editorialTrustPresent: metrics.editorialLinkPresent,
      authorTrustPresent: metrics.authorLinkPresent,
      sidebarBreakpointCorrect: metrics.sectionNavVisible === viewport.expectedSidebar,
      articleFitsViewport: metrics.articleWidth <= metrics.viewportWidth,
      quickAnswerFitsViewport: metrics.quickAnswerWidth <= metrics.viewportWidth,
      noPageErrors: pageErrors.length === 0,
      noConsoleErrors: consoleErrors.length === 0,
    };

    const passed = Object.values(checks).every(Boolean);
    if (!passed) failures += 1;

    const screenshotPath = path.join(reportDir, `${viewport.name}-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    results.push({
      viewport,
      status,
      passed,
      checks,
      metrics,
      pageErrors,
      consoleErrors,
      screenshotPath,
    });

    line(`${viewport.name.toUpperCase()}_VIEW=${passed ? "PASS" : "FAIL"}`);
    line(`HTTP_STATUS=${status}`);
    line(`PAGE_WIDTH=${metrics.documentWidth}`);
    line(`VIEWPORT_WIDTH=${metrics.viewportWidth}`);
    line(`H1_COUNT=${metrics.h1Count}`);
    line(`H1_FONT_SIZE=${metrics.h1FontSize}`);
    line(`FAQ_COUNT=${metrics.faqCount}`);
    line(`MIN_FAQ_TAP_HEIGHT=${metrics.minimumFaqTapHeight}`);
    line(`SIDEBAR_VISIBLE=${metrics.sectionNavVisible ? "YES" : "NO"}`);
    line(`OVERFLOW_ELEMENTS=${metrics.overflowElements.length}`);
    line(`PAGE_ERRORS=${pageErrors.length}`);
    line(`CONSOLE_ERRORS=${consoleErrors.length}`);
    line(`SCREENSHOT=${screenshotPath}`);
    line();

    await page.close();
  }

  fs.writeFileSync(resultPath, JSON.stringify({ auditUrl, failures, results }, null, 2));
  fs.writeFileSync(summaryPath, `${outputLines.join("\n")}\n`, "utf8");

  line(`RESPONSIVE_FAILURES=${failures}`);
  line(`BLOG_RESPONSIVE_AUDIT=${failures === 0 ? "PASS" : "FAIL"}`);
  line(`RESPONSIVE_JSON=${resultPath}`);
  line(`REPORT_DIR=${reportDir}`);

  process.exitCode = failures === 0 ? 0 : 1;
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  line(`BLOG_RESPONSIVE_AUDIT=ERROR`);
  line(message);
  fs.writeFileSync(summaryPath, `${outputLines.join("\n")}\n`, "utf8");
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await stopServer();
}
