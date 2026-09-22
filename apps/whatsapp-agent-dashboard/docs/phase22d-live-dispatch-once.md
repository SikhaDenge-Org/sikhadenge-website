# Phase22D one-time live canary dispatcher

This control-plane marker invokes the already-reviewed Phase17 single-message canary operator exactly once after protected-release CI and merge.

Fixed scope:
- deployed production SHA: `4e4bcb0119f2096ee2f95c95862c5c0d797c1021`
- controlled-launch state version: `2`
- exact fresh internal canary message: `cmucaz4wy0005kwqb99jodzqx`
- exact sole active ADMIN principal previously evidenced by Phase22D production provision runs
- explicit one-message approval reason
- `execute=true`

The dispatcher itself performs no Meta/provider call, does not change PM2 or `.env`, and does not enable batch/general outbound. All production mutation/send authority remains inside the existing reviewed single-message operator, including exact INTERNAL_TEST recipient/template checks, scheduler isolation, one-time approval consumption, provider-boundary enforcement, and automatic restore to SHADOW/no-external-writes.
