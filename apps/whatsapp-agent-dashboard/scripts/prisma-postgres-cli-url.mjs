#!/usr/bin/env node

// Production Batch retry trigger after V17 source reconciliation — 2026-09-14
// Production Batch exact-SHA companion trigger for machine evidence — 2026-09-14
// Production Batch exact-SHA retry trigger for operator governance — 2026-09-14
// Production Batch exact-SHA companion trigger for refreshed machine evidence — 2026-09-14
// Production Batch retry trigger after Page02 V19 release drift — 2026-09-14
// Production Batch exact-SHA companion trigger for Page02 V19 machine evidence — 2026-09-14
// Atomic exact-SHA companion trigger for final Page02 V19 machine evidence — 2026-09-14
// Clean atomic retry after production concurrency drain — 2026-09-14
// Production Batch trigger for Page02 mobile Lead Intelligence drawer width fix — 2026-09-14
// Email DRY_RUN PM2 environment synchronization deployment marker — 2026-09-17
// Align exact production SHA before guarded Email internal-recipient test — 2026-09-17
// Email lifecycle readiness audit after guarded DRY_RUN activation — 2026-09-17
// Align production SHA after lifecycle readiness before internal-recipient test — 2026-09-17
// Guarded Email internal-recipient delivery verification — 2026-09-17
// Deploy Email E4 guarded limited-cohort gate — 2026-09-17
// Guarded Email limited-cohort automation window verification — 2026-09-17
// Deploy Email E4 limited-cohort preflight fix — 2026-09-17
// Retry guarded Email limited-cohort window after preflight fix — 2026-09-17
// Deploy Email E4 PM2 limited-cohort env sync fix — 2026-09-17
const rawUrl = process.argv[2] ?? "";

if (!rawUrl.trim()) {
  console.error("A PostgreSQL connection URL is required.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(rawUrl);
} catch {
  console.error("The PostgreSQL connection URL is invalid.");
  process.exit(1);
}

if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
  console.error("Only PostgreSQL connection URLs are supported.");
  process.exit(1);
}

for (const parameter of [
  "schema",
  "connection_limit",
  "pool_timeout",
  "pgbouncer",
]) {
  parsed.searchParams.delete(parameter);
}

process.stdout.write(parsed.toString());