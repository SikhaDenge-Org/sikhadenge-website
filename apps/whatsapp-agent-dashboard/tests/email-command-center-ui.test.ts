import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const page = fs.readFileSync(path.join(root, "app/email/page.tsx"), "utf8");
const overview = fs.readFileSync(
  path.join(root, "modules/email-automation/ui/EmailWorkspaceOverview.tsx"),
  "utf8",
);
const css = fs.readFileSync(
  path.join(root, "modules/email-automation/ui/EmailWorkspaceOverview.module.css"),
  "utf8",
);

if (!page.includes('import { Manrope } from "next/font/google"')) {
  throw new Error("Email Command Center must use scoped Manrope via next/font/google.");
}
if (!page.includes("emailManrope.className")) {
  throw new Error("Manrope must remain scoped to the Email Command Center body.");
}
if (!overview.includes('href="/email/accounts"') || !overview.includes('href="/email/templates"') || !overview.includes('href="/email/send"') || !overview.includes('href="/email/automation"')) {
  throw new Error("Email Command Center quick navigation routes are incomplete.");
}
if (!overview.includes('/api/email/connections') || !overview.includes('/api/email/platform/overview')) {
  throw new Error("Email Command Center must remain data-driven from live Email APIs.");
}
if (!css.includes(".metricGrid") || !css.includes(".quickGrid") || !css.includes(".primaryGrid")) {
  throw new Error("Email Command Center visual system is incomplete.");
}
console.log("Email Command Center UI scope checks passed.");
