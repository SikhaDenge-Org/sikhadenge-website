# Email internal-test single-file production sync trigger

Purpose: deploy only the reviewed `email-automation-production-internal-test.sh` safety hardening to the certified live Email runtime without a full application deploy.

Guardrails:
- expected live Git SHA: `4e4bcb0119f2096ee2f95c95862c5c0d797c1021`
- expected old script blob: `b716b75f366a6e9d32e8fce413e3d42ebbc79ab6`
- reviewed new script blob: `a04e7aa5942cc212413d90a862c600722f2a90b1`
- pre-sync DRY_RUN scheduler verification required
- backup + rollback on any sync/verification failure
- post-sync DRY_RUN scheduler verification required
- no app build, no database migration, no customer/cohort activation, no email send

Retry note (2026-09-22): initial production run stopped before mutation because SCP/SFTP could not write the remote /tmp staging file. Retry 2 streams the reviewed file over the already-pinned SSH session into the protected root backup directory; all live SHA/blob/DRY_RUN guards remain unchanged.
