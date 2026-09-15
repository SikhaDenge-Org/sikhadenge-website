export {};
const token = process.env.EMAIL_AUTOMATION_SCHEDULER_TOKEN?.trim();
if (!token) throw new Error("EMAIL_AUTOMATION_SCHEDULER_TOKEN is required.");
const base = (process.env.EMAIL_AUTOMATION_SCHEDULER_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15000);
try {
  const response = await fetch(base + "/api/internal/email/automation/process", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ workspaceLimit: 20, perWorkspaceLimit: 20 }), signal: controller.signal });
  const text = await response.text();
  if (!response.ok) throw new Error("Scheduler request failed " + response.status + ": " + text);
  console.log(text);
} finally { clearTimeout(timeout); }
