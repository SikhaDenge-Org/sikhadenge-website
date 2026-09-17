import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const stage = process.env.AUDIT_STAGE;
const root = process.env.AUDIT_ROOT;
const reportDir = process.env.AUDIT_OUT;
const databaseUrl = process.env.DATABASE_URL;
const browserExecutable = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const port = Number(process.env.AUDIT_PORT || "3111");

if (!stage || !root || !reportDir || !databaseUrl || !browserExecutable) {
  console.error("Missing AUDIT_STAGE, AUDIT_ROOT, AUDIT_OUT, DATABASE_URL, or PLAYWRIGHT_EXECUTABLE_PATH.");
  process.exit(2);
}

fs.mkdirSync(reportDir, { recursive: true });

const baseUrl = `http://127.0.0.1:${port}`;
const productionBase = "https://sikhadenge.in";
const serverLogPath = path.join(reportDir, "server.log");
const jsonPath = path.join(reportDir, "search-visibility-audit.json");
const summaryPath = path.join(reportDir, "search-visibility-audit.txt");
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
let serverClosed = false;
const output = [];

function line(value = "") {
  output.push(String(value));
  console.log(value);
}

async function stopServer() {
  if (serverClosed) return;
  serverClosed = true;
  if (!server.killed) server.kill("SIGTERM");
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
      const response = await fetch(`${baseUrl}/blog/chatgpt-se-resume-kaise-banaye`, {
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

function decodeHtml(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function stripTags(value = "") {
  return decodeHtml(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function findTag(html, name, attributeName, expectedValue) {
  return tags(html, name).find((tag) => attribute(tag, attributeName).toLowerCase() === expectedValue.toLowerCase()) || "";
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : "";
}

function extractFirstTagText(html, name) {
  const match = html.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? stripTags(match[1]) : "";
}

function parseJsonLd(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const parsed = [];
  for (const match of scripts) {
    try {
      parsed.push(JSON.parse(decodeHtml(match[1])));
    } catch {
      // Reported through schema checks below.
    }
  }
  return parsed;
}

function schemaNodes(documents) {
  return documents.flatMap((document) => Array.isArray(document?.["@graph"]) ? document["@graph"] : [document]).filter(Boolean);
}

function hasType(node, type) {
  const value = node?.["@type"];
  return Array.isArray(value) ? value.includes(type) : value === type;
}

const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "best", "by", "complete", "for", "from", "guide", "how", "in", "is", "kaise", "of", "on", "se", "the", "to", "using", "what", "with", "your", "2024", "2025", "2026", "2027",
]);

function normaliseWords(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

function longTailCoverage(route, corpus) {
  const slug = route.split("/").filter(Boolean).at(-1) || "";
  const tokens = [...new Set(normaliseWords(slug).filter((token) => !stopWords.has(token) && (token.length >= 3 || ["ai", "seo"].includes(token))))];
  const words = new Set(normaliseWords(corpus));
  const matched = tokens.filter((token) => words.has(token));
  return {
    tokens,
    matched,
    ratio: tokens.length ? matched.length / tokens.length : 1,
  };
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20000) });
  return { response, text: await response.text() };
}

async function auditRoute(route) {
  try {
    const { response, text: html } = await fetchText(`${baseUrl}${route}`);
    const expectedCanonical = `${productionBase}${route}`;
    const title = extractTitle(html);
    const h1 = extractFirstTagText(html, "h1");
    const descriptionTag = findTag(html, "meta", "name", "description");
    const robotsTag = findTag(html, "meta", "name", "robots");
    const canonicalTag = tags(html, "link").find((tag) => attribute(tag, "rel").toLowerCase() === "canonical") || "";
    const description = attribute(descriptionTag, "content");
    const robots = attribute(robotsTag, "content").toLowerCase();
    const canonical = attribute(canonicalTag, "href");
    const jsonLd = parseJsonLd(html);
    const nodes = schemaNodes(jsonLd);
    const article = nodes.find((node) => hasType(node, "Article"));
    const faq = nodes.find((node) => hasType(node, "FAQPage"));
    const breadcrumb = nodes.find((node) => hasType(node, "BreadcrumbList"));
    const visibleText = stripTags(html);
    const coverage = longTailCoverage(route, `${title} ${h1} ${description} ${visibleText}`);
    const h1Count = (html.match(/<h1\b/gi) || []).length;
    const visibleFaqCount = (html.match(/<details\b/gi) || []).length;
    const internalLinks = [...html.matchAll(/<a\b[^>]*href=["'](\/[^"'#?]*)/gi)].map((match) => match[1]);
    const uniqueInternalLinks = new Set(internalLinks);
    const faqEntities = Array.isArray(faq?.mainEntity) ? faq.mainEntity : [];
    const breadcrumbItems = Array.isArray(breadcrumb?.itemListElement) ? breadcrumb.itemListElement : [];
    const articleAbout = Array.isArray(article?.about) ? article.about : [];
    const datePublished = String(article?.datePublished || "");
    const dateModified = String(article?.dateModified || "");

    const checks = {
      http200: response.status === 200,
      canonicalExact: canonical === expectedCanonical,
      robotsIndexFollow: robots.includes("index") && robots.includes("follow") && !robots.includes("noindex"),
      titlePresent: title.length >= 10,
      descriptionPresent: description.length >= 50,
      singleH1: h1Count === 1 && h1.length >= 10,
      articleSchema: Boolean(article),
      faqSchema: Boolean(faq) && faqEntities.length >= 5,
      breadcrumbSchema: Boolean(breadcrumb) && breadcrumbItems.length >= 3,
      schemaHeadlineMatchesH1: String(article?.headline || "") === h1,
      schemaCanonicalMatches: String(article?.url || "") === expectedCanonical,
      schemaDatesPresent: /^20\d{2}-\d{2}-\d{2}/.test(datePublished) && /^20\d{2}-\d{2}-\d{2}/.test(dateModified) && dateModified >= datePublished,
      schemaAuthorPublisher: Boolean(article?.author?.name) && Boolean(article?.publisher),
      schemaEntityContext: articleAbout.length >= 2,
      quickAnswerVisible: html.includes('id="quick-answer"'),
      faqVisible: html.includes('id="faq"') && visibleFaqCount >= 5,
      faqVisibleSchemaAligned: visibleFaqCount === faqEntities.length,
      sourceStandardVisible: html.includes('id="source-standard"'),
      authorLinkVisible: html.includes('href="/authors/sikhadenge-editorial-team"'),
      editorialPolicyVisible: html.includes('href="/editorial-policy"'),
      relatedLinksVisible: html.includes('id="related"'),
      internalLinkFoundation: uniqueInternalLinks.size >= 5,
      longTailIntentCoverage: coverage.ratio >= 0.6,
    };

    const advisory = {
      titleLengthRecommended: title.length >= 30 && title.length <= 90,
      descriptionLengthRecommended: description.length >= 100 && description.length <= 200,
    };

    const failedChecks = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);

    return {
      route,
      status: response.status,
      passed: failedChecks.length === 0,
      failedChecks,
      checks,
      advisory,
      metrics: {
        title,
        titleLength: title.length,
        descriptionLength: description.length,
        h1,
        h1Count,
        canonical,
        robots,
        jsonLdDocuments: jsonLd.length,
        schemaTypes: nodes.flatMap((node) => Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]]).filter(Boolean),
        visibleFaqCount,
        schemaFaqCount: faqEntities.length,
        uniqueInternalLinks: uniqueInternalLinks.size,
        longTailTokens: coverage.tokens,
        longTailMatched: coverage.matched,
        longTailCoverage: Number(coverage.ratio.toFixed(3)),
        datePublished,
        dateModified,
      },
    };
  } catch (error) {
    return {
      route,
      status: 0,
      passed: false,
      failedChecks: ["requestError"],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
      if ((index + 1) % 50 === 0 || index + 1 === items.length) line(`ROUTE_PROGRESS=${index + 1}/${items.length}`);
    }
  });
  await Promise.all(runners);
  return results;
}

async function auditRepresentative(route) {
  const pageErrors = [];
  const consoleErrors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || "";
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const answer = text("#quick-answer");
    const wordCount = answer.split(/\s+/).filter(Boolean).length;
    return {
      title: document.title,
      h1: text("h1"),
      h2Count: document.querySelectorAll("h2").length,
      answerWordCount: wordCount,
      quickAnswerVisible: visible("#quick-answer"),
      faqCount: document.querySelectorAll("#faq details").length,
      faqVisible: visible("#faq"),
      sourceStandardVisible: visible("#source-standard"),
      authorLinkVisible: visible('a[href="/authors/sikhadenge-editorial-team"]'),
      editorialPolicyVisible: visible('a[href="/editorial-policy"]'),
      relatedLinkCount: document.querySelectorAll("#related a").length,
      updatedTextPresent: document.body.innerText.includes("Updated"),
      internalLinkCount: new Set([...document.querySelectorAll('a[href^="/"]')].map((link) => link.getAttribute("href"))).size,
    };
  });
  await page.close();

  const segments = {
    SEO: response?.status() === 200 && metrics.h1.length >= 10 && metrics.internalLinkCount >= 5,
    AEO: metrics.quickAnswerVisible && metrics.answerWordCount >= 20 && metrics.faqVisible && metrics.faqCount >= 5,
    GEO: metrics.quickAnswerVisible && metrics.sourceStandardVisible && metrics.h2Count >= 5,
    LLMO: metrics.quickAnswerVisible && metrics.authorLinkVisible && metrics.editorialPolicyVisible && metrics.relatedLinkCount >= 1,
    AISEO_AISO: metrics.h1.length >= 10 && metrics.h2Count >= 5 && metrics.internalLinkCount >= 5,
    EEAT: metrics.authorLinkVisible && metrics.editorialPolicyVisible && metrics.sourceStandardVisible && metrics.updatedTextPresent,
  };
  const passed = Object.values(segments).every(Boolean) && pageErrors.length === 0 && consoleErrors.length === 0;
  return { route, passed, status: response?.status() || 0, segments, metrics, pageErrors, consoleErrors };
}

try {
  await waitForServer();
  line("ISOLATED_SERVER_READY=YES");

  const manifestPath = path.join(stage, ".next", "prerender-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const routes = Object.entries(manifest.routes)
    .filter(([, value]) => value?.srcRoute === "/blog/[slug]")
    .map(([route]) => route)
    .sort();

  if (routes.length === 0) throw new Error("No prerendered /blog/[slug] routes found.");
  line(`BLOG_ROUTES_DISCOVERED=${routes.length}`);

  const routeResults = await mapConcurrent(routes, 10, auditRoute);
  const failedRoutes = routeResults.filter((result) => !result.passed);
  const routePasses = routeResults.length - failedRoutes.length;

  const invalidSlug = `/blog/__sikhadenge_invalid_${Date.now()}`;
  const invalidResponse = await fetch(`${baseUrl}${invalidSlug}`, { redirect: "manual" });
  const invalidSlug404 = invalidResponse.status === 404;

  const aiTxtResponse = await fetch(`${baseUrl}/ai.txt`);
  const aiTxtBody = await aiTxtResponse.text();
  const aiTxtPass = aiTxtResponse.status === 200 && aiTxtBody.trim().length >= 20;

  const llmsTxtResponse = await fetch(`${baseUrl}/llms.txt`);
  const llmsTxtBody = await llmsTxtResponse.text();
  const llmsTxtPass = llmsTxtResponse.status === 200 && llmsTxtBody.trim().length >= 20;

  browser = await chromium.launch({
    headless: true,
    executablePath: browserExecutable,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const preferred = [
    "/blog/chatgpt-se-resume-kaise-banaye",
    "/blog/ai-se-freelancing-kaise-start-kare",
    "/blog/ai-se-paise-kaise-kamaye",
  ];
  const representativeRoutes = preferred.filter((route) => routes.includes(route));
  while (representativeRoutes.length < 3 && routes[representativeRoutes.length]) {
    const candidate = routes[representativeRoutes.length];
    if (!representativeRoutes.includes(candidate)) representativeRoutes.push(candidate);
  }
  const representativeResults = [];
  for (const route of representativeRoutes.slice(0, 3)) {
    representativeResults.push(await auditRepresentative(route));
  }

  const representativeFailures = representativeResults.filter((result) => !result.passed);
  const overallPass = failedRoutes.length === 0 && invalidSlug404 && aiTxtPass && llmsTxtPass && representativeFailures.length === 0;

  const report = {
    auditedAt: new Date().toISOString(),
    buildId: fs.readFileSync(path.join(stage, ".next", "BUILD_ID"), "utf8").trim(),
    routesDiscovered: routes.length,
    routePasses,
    routeFailures: failedRoutes.length,
    failedRoutes,
    invalidSlug404,
    aiTxt: { passed: aiTxtPass, status: aiTxtResponse.status, length: aiTxtBody.trim().length },
    llmsTxt: { passed: llmsTxtPass, status: llmsTxtResponse.status, length: llmsTxtBody.trim().length },
    representativeResults,
    overallPass,
    routeResults,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  line(`BLOG_ROUTE_PASS=${routePasses}`);
  line(`BLOG_ROUTE_FAIL=${failedRoutes.length}`);
  line(`INVALID_SLUG_404=${invalidSlug404 ? "PASS" : "FAIL"}`);
  line(`AI_TXT=${aiTxtPass ? "PASS" : "FAIL"}`);
  line(`LLMS_TXT=${llmsTxtPass ? "PASS" : "FAIL"}`);

  for (const result of representativeResults) {
    line(`REPRESENTATIVE_ROUTE=${result.route}`);
    for (const [segment, passed] of Object.entries(result.segments)) line(`${segment}=${passed ? "PASS" : "FAIL"}`);
    line(`REPRESENTATIVE_RESULT=${result.passed ? "PASS" : "FAIL"}`);
  }

  if (failedRoutes.length > 0) {
    for (const result of failedRoutes.slice(0, 20)) line(`FAILED_ROUTE=${result.route} CHECKS=${result.failedChecks.join(",")}`);
  }

  line(`BLOG_SEARCH_VISIBILITY_AUDIT=${overallPass ? "PASS" : "FAIL"}`);
  line(`SEARCH_VISIBILITY_JSON=${jsonPath}`);
  line(`REPORT_DIR=${reportDir}`);

  fs.writeFileSync(summaryPath, `${output.join("\n")}\n`, "utf8");
  process.exitCode = overallPass ? 0 : 1;
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  line("BLOG_SEARCH_VISIBILITY_AUDIT=ERROR");
  line(message);
  fs.writeFileSync(summaryPath, `${output.join("\n")}\n`, "utf8");
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await stopServer();
}
