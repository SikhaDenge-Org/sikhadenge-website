#!/usr/bin/env node

// Production Batch retry trigger after V17 source reconciliation — 2026-09-14
// Production Batch exact-SHA companion trigger for machine evidence — 2026-09-14
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
