import assert from "node:assert/strict";

import { parseControlledLaunchApprovedFlowProof } from "../modules/release/application/controlled-launch-approved-flow";

function testValidCampaignProof() {
  assert.deepEqual(
    parseControlledLaunchApprovedFlowProof({
      outbound: {
        approvedFlow: { flowType: "CAMPAIGN", flowId: "campaign-1", flowVersion: 1 },
      },
    }),
    { flowType: "CAMPAIGN", flowId: "campaign-1", flowVersion: 1 },
  );
}

function testValidAutomationProof() {
  assert.deepEqual(
    parseControlledLaunchApprovedFlowProof({
      outbound: {
        approvedFlow: { flowType: "AUTOMATION", flowId: "masterclass-registration", flowVersion: 1 },
      },
    }),
    { flowType: "AUTOMATION", flowId: "masterclass-registration", flowVersion: 1 },
  );
}
function testMissingOrMalformedProofFailsClosed() {
  assert.equal(parseControlledLaunchApprovedFlowProof({ outbound: {} }), null);
  assert.equal(
    parseControlledLaunchApprovedFlowProof({
      outbound: { approvedFlow: { flowType: "CAMPAIGN", flowId: "", flowVersion: 1 } },
    }),
    null,
  );
  assert.equal(
    parseControlledLaunchApprovedFlowProof({
      outbound: { approvedFlow: { flowType: "OTHER", flowId: "flow-1", flowVersion: 1 } },
    }),
    null,
  );
  assert.equal(
    parseControlledLaunchApprovedFlowProof({
      outbound: { approvedFlow: { flowType: "AUTOMATION", flowId: "flow-1", flowVersion: 0 } },
    }),
    null,
  );
}

function main() {
  testValidCampaignProof();
  testValidAutomationProof();
  testMissingOrMalformedProofFailsClosed();
  console.log("EngageOS Phase17-G4 approved-flow provenance: PASS");
}

main();
