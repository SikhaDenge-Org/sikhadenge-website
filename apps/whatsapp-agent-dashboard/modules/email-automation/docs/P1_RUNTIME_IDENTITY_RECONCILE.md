# P1 Runtime Identity Reconcile

This operational control exists only to repair a production invariant discovered by the fail-closed Email P1 deployment: the tracked production source may be correct and clean while the PM2 runtime cwd still serves a different `.next/BUILD_ID`.

The reconcile workflow is deliberately narrow. It requires the exact current production source SHA, a clean tracked worktree, Email runtime `DRY_RUN`, and external Email writes disabled. It copies the already-built `.next` from the canonical production source app to the authorized PM2 runtime cwd only when their build IDs differ, restarts only the web process, verifies both build IDs match, confirms local and public login HTTP 200, and verifies the source SHA/worktree are unchanged.

A backup of the previous runtime `.next` is taken first and restored on any failure. The control does not change Git source, Email runtime mode, scheduler policy, recipient allowlists, provider credentials, or customer-send authorization.
