# Phase22E post-canary read-only verification

Purpose: verify the production WhatsApp runtime after the successful one-message internal canary without performing another provider send or enabling general outbound.

The verifier is intentionally separated from the protected release tip because post-canary control-plane/docs commits can advance GitHub without redeploying the application runtime. It validates the known deployed runtime SHA independently.

Required production invariants:
- WhatsApp app and automation scheduler PM2 processes are online.
- Public login route returns HTTP 200.
- Automation, journey, campaign, and scheduler outbound execution remain disabled.
- Base WhatsApp outbound mode remains non-live, cutover approval remains false, live acknowledgement remains unset, and kill switch remains on.
- Controlled launch remains ONE_CONNECTED_ACCOUNT / SHADOW / NO_EXTERNAL_WRITES with external writes disabled.
- No active one-time outbound approvals remain.
- The qualified internal canary retains a Meta message ID and a provider-progress status (SENT, DELIVERED, or READ).
- Provider binding parity has zero mappings requiring repair.
- Verification itself mutates no runtime flags and requests no external WhatsApp write.

The workflow is safe to rerun manually and also runs once when first merged to the protected WhatsApp release.
Runtime note: optional automation/journey/campaign flags use the application’s fail-closed semantics, so unset/false/off/disabled are all treated as safely off. The actual provider-dispatch gate, outbound mode, and kill switch remain strict production assertions.

Dirty-path inventory note: the verifier prints the exact tracked dirty paths before enforcing its allowlist. This is read-only evidence collection; unknown drift still fails closed.
Production drift note: current production contains exactly two tracked out-of-scope Email-only modifications. Phase22E does not modify them; it permits them only when both exact paths are present and each live SHA-256 matches the protected-release reviewed copy. Any missing, additional, reordered, or hash-mismatched tracked drift fails closed.
Transport note: the read-only verifier uses bounded SSH connection retries and keepalives so a transient banner-exchange timeout does not get misclassified as a production invariant failure. Remote checks remain read-only and still fail closed on any invariant mismatch.
Scheduler semantics note: `AUTOMATION_RUNTIME_ENABLED` and `JOURNEY_RUNTIME_ENABLED` may be enabled for observation/shadow processing. They do not authorize external action execution by themselves. Phase22E therefore records runtime state but strictly requires automation actions, journey actions, campaigns, scheduler outbound dispatch, provider live mode, and external-write gates to remain disabled/fail-closed.
Targeted scheduler note: production may legitimately retain `AUTOMATION_RUNTIME_ENABLED=true` and `AUTOMATION_ACTIONS_ENABLED=true` only when `WHATSAPP_AUTOMATION_EVENT_SOURCE_PREFIX` exactly matches the successful Phase21G designated internal canary cohort (`phase21g-canary:35627603829:1:4e4bcb0119f2096ee2f95c95862c5c0d797c1021`). Phase22E additionally requires that cohort to contain exactly one already-PROCESSED event, attemptCount=1, zero pending rows, and zero recorded errors. General outbound dispatch remains disabled and controlled launch remains SHADOW / NO_EXTERNAL_WRITES.
