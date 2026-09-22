# Email inbound readiness single-file sync trigger

Merging this marker runs the guarded Email-only production sync for scripts/email-inbound-production-readiness.ts. The workflow asserts the exact current production SHA and old/new Git blobs, backs up the old file, rolls back on failure, and does not deploy unrelated WhatsApp release changes or restart PM2.

Retry marker: 2026-09-22T10:40+05:30 after expected-BLOCKED trap fix.
