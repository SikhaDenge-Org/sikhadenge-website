#!/usr/bin/env bash
set -Eeuo pipefail

script_root="scripts"
gate="$script_root/engageos-phase17-governance-release-exit-gate.sh"
postdeploy="$script_root/engageos-production-phase17-postdeploy-gate.sh"
migrate="$script_root/engageos-production-migrate-v2.sh"
batch="$script_root/engageos-production-batch1.sh"

for script in "$gate" "$postdeploy" "$migrate" "$batch"; do
  test -f "$script"
  bash -n "$script"
done

migrations=(
  20260913113000_add_phase17_controlled_launch_state
  20260916173000_add_phase17_outbound_approval_engine
  20260916190000_add_phase17_g3_bounded_autopilot_recipient_ledger
  20260916210000_add_phase17_g4_approved_flow_registry
  20260916223000_add_phase17_g5_approved_flow_revocation_audit
)

previous_line=0
for migration in "${migrations[@]}"; do
  test -d "prisma/migrations/$migration"
  grep -Fq "$migration" "$gate"
  line="$(grep -nF "$migration" "$gate" | head -n1 | cut -d: -f1)"
  test "$line" -gt "$previous_line"
  previous_line="$line"
done
for table_name in \
  EngageControlledLaunchOutboundApproval \
  EngageControlledLaunchAutopilotRecipient \
  EngageControlledLaunchApprovedFlow; do
  grep -Fq "$table_name" "$gate"
  grep -Fq "$table_name" "$migrate"
done

grep -Fq 'revokedByUserId' "$gate"
grep -Fq 'revokeReason' "$gate"
grep -Fq 'EngageControlledLaunchAutopilotRecipient_scope_recipient_key' "$gate"
grep -Fq 'EngageControlledLaunchApprovedFlow_active_unique' "$gate"
grep -Fq 'SHADOW controlled-launch state permits or requests external writes' "$gate"
grep -Fq 'phase17-governance-release-exit-evidence.txt' "$gate"
grep -Fq 'PASS: PHASE17_GOVERNANCE_RELEASE_EXIT_GATE' "$gate"

# Exit gate is verification-only: it must not mutate migration or governance state.
if grep -Eqi 'prisma migrate deploy|prisma migrate resolve|INSERT[[:space:]]+INTO|UPDATE[[:space:]]+|DELETE[[:space:]]+FROM|ALTER[[:space:]]+TABLE|DROP[[:space:]]+TABLE' "$gate"; then
  printf 'G7 governance release exit gate must remain read-only.\n' >&2
  exit 1
fi

controlled_line="$(grep -nF 'PASS: PHASE17_POSTDEPLOY_CONTROLLED_LAUNCH_GATE' "$postdeploy" | head -n1 | cut -d: -f1)"
governance_line="$(grep -nF 'engageos-phase17-governance-release-exit-gate.sh' "$postdeploy" | head -n1 | cut -d: -f1)"
test -n "$controlled_line"
test -n "$governance_line"
test "$controlled_line" -lt "$governance_line"

printf 'EngageOS Phase17-G7 release exit gate policy: PASS\n'
