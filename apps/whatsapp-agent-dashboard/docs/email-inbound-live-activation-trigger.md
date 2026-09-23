# Email inbound live activation trigger

Phase B production gate for `support@sikhadenge.in` in workspace `engagews_default`.

This trigger is intentionally guarded by the production activation workflow. The workflow must fail closed before enabling inbound sync unless Gmail read-only OAuth access is authorized, the live runtime matches the reviewed critical Email files, the send runtime remains `DRY_RUN`, and external writes remain disabled.

Requested on 2026-09-23 after Phase A production runtime-truth certification.
