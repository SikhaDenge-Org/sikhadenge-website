import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeOperationalHealth } from "../modules/analytics/domain/operational-health";

const metrics = readFileSync("lib/observability/metrics.ts", "utf8");
const route = readFileSync("app/api/observability/agent/route.ts", "utf8");
const queueRoute = readFileSync("app/api/operations/queue/route.ts", "utf8");

assert.match(metrics, /listPersistedIntegrationHealth/);
assert.match(metrics, /computeOperationalHealth/);
assert.match(metrics, /eventType:\s*\{ in: \["message", "status"\] \}/);
assert.match(metrics, /automation_runtime_run/);
assert.match(metrics, /equals: "RETRYABLE"/);
assert.match(metrics, /equals: "FAILED"/);
assert.match(metrics, /oldestPendingAgeMs/);
assert.match(metrics, /failedOutbound/);
assert.match(metrics, /degradedProviders/);
assert.match(metrics, /status !== "CONNECTED"/);
assert.match(route, /DashboardRole\.ADMIN/);
assert.match(route, /DashboardRole\.MANAGER/);
assert.match(route, /DashboardRole\.ANALYST/);
assert.match(route, /Cache-Control/);
assert.match(route, /no-store/);
assert.match(queueRoute, /outboundSent:\s*false/);

const degraded = computeOperationalHealth({ webhookReceived: 100, webhookFailed: 7, outboundSent: 100, outboundFailed: 1, queueLagSamplesMs: [10], deadLetterCount: 0 });
assert.equal(degraded.degraded, true);
const lagged = computeOperationalHealth({ webhookReceived: 100, webhookFailed: 0, outboundSent: 100, outboundFailed: 0, queueLagSamplesMs: [61000], deadLetterCount: 0 });
assert.equal(lagged.degraded, true);
const healthy = computeOperationalHealth({ webhookReceived: 100, webhookFailed: 0, outboundSent: 100, outboundFailed: 0, queueLagSamplesMs: [100], deadLetterCount: 0 });
assert.equal(healthy.degraded, false);
console.log("Phase14 observability command center certification: PASS");
