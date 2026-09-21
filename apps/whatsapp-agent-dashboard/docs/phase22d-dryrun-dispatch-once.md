# Phase22D one-time DRY_RUN dispatcher

This control-plane marker exists only to make the protected WhatsApp release run its required CI before the one-time no-send dispatcher is merged.

The paired workflow dispatches the existing Phase17 single-message canary with:

- the exact Phase22D internal canary message ID
- the currently deployed production SHA
- controlled-launch state version 2
- `execute=false`

It does not request an external WhatsApp provider write and does not enable persistent outbound flags.
