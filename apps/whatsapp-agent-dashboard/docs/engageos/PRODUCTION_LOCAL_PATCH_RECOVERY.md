# Production-local patch recovery

## Evidence boundary

Production Batch #12 confirmed that the live worktree at `6cf48dfe8fcd3f14d498dfeb3d1ea70d1be37a8e` contains exactly 10 tracked modifications while the reviewed release lineage is a direct descendant. The deployment remains fail-closed until those local modifications are preserved, reconciled, and proven equivalent or intentionally integrated.

The recovery workflow is intentionally non-destructive. When the dirty set exactly matches the reviewed 10-path allowlist it writes a binary-capable Git patch and a metadata-only manifest under the run-specific protected backup directory, sets the recovery files to mode 0600, records SHA-256 digests, and then still exits at the existing dirty-worktree gate.

The plaintext patch remains only in the protected production backup directory. Before any copy leaves the server, the workflow encrypts the patch with an ephemeral RSA recovery certificate using OpenSSL CMS with AES-256 content encryption. GitHub Actions collects only the encrypted `.p7m` payload plus the metadata-only manifest. The matching private recovery key is never committed to the repository, sent to GitHub, or installed on the VPS.

If the tracked path set changes, patch capture fails closed before producing a recovery artifact. The workflow never runs `git clean`, `git reset`, `git checkout` over the live changes, or a stash operation during this recovery phase.

## Batch #12 tracked paths

1. `app/api/analytics/overview/route.ts`
2. `app/api/conversations/route.ts`
3. `app/globals.css`
4. `app/inbox/page.tsx`
5. `app/layout.tsx`
6. `components/inbox/InboxDashboardV2.tsx`
7. `lib/inbox/conversation-repository.ts`
8. `next-env.d.ts`
9. `package.json`
10. `scripts/masterclass-flow-worker.ts`

Paths above are relative to `apps/whatsapp-agent-dashboard`; the workflow uses repository-root-relative allowlisted pathspecs.

## Exit gate

A successful recovery capture is evidence only. It does not authorize deployment. The next stage must decrypt and inspect the captured patch in the controlled recovery environment, compare it against both the live base and the current release, integrate any valid production-only behavior on a review branch, pass full CI, and only then design a hash-locked cleanup/reconciliation step for the live worktree.
