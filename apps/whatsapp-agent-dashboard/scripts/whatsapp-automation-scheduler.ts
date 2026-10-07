import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvironmentFile(): void {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

loadEnvironmentFile();

const rawInterval = Number(process.env.WHATSAPP_AUTOMATION_SCHEDULER_INTERVAL_MS ?? "5000");
const INTERVAL_MS = Math.max(1000, Math.min(60000, Number.isFinite(rawInterval) ? Math.floor(rawInterval) : 5000));
let stopping = false;
let running = false;
let timer: NodeJS.Timeout | null = null;

function log(event: string, detail: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ service: "sikhadenge-whatsapp-automation-scheduler", event, at: new Date().toISOString(), ...detail }));
}

async function runCycle() {
  if (running || stopping) return;
  running = true;
  try {
    const { runWhatsAppAutomationSchedulerCycle } = await import("../modules/automations/application/whatsapp-automation-scheduler");
    const result = await runWhatsAppAutomationSchedulerCycle({ limit: 20 });
    log(result.paused ? "paused" : "cycle", result as unknown as Record<string, unknown>);
  } catch (error) {
    log("cycle_error", { error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error" });
  } finally {
    running = false;
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  if (timer) clearInterval(timer);
  log("shutdown", { signal });
  const deadline = Date.now() + 15000;
  while (running && Date.now() < deadline) await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("uncaughtException", (error) => { log("uncaught_exception", { error: error.message.slice(0, 1000) }); void shutdown("UNCAUGHT_EXCEPTION"); });
process.on("unhandledRejection", (reason) => log("unhandled_rejection", { reason: String(reason).slice(0, 1000) }));

if (process.env.WHATSAPP_AUTOMATION_SCHEDULER_ENABLED?.trim().toLowerCase() !== "true") {
  throw new Error("WHATSAPP_AUTOMATION_SCHEDULER_ENABLED=true is required to start the WhatsApp automation scheduler.");
}

log("started", { intervalMs: INTERVAL_MS });
void runCycle();
timer = setInterval(() => void runCycle(), INTERVAL_MS);
