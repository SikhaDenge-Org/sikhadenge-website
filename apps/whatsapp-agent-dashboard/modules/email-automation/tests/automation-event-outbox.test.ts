import assert from "node:assert/strict";

import { assertEmailAutomationEventRequeueAllowed, buildEmailAutomationEventKey, EMAIL_EVENT_STATUS } from "../automation/event-outbox";
import { buildEmailAutomationIdempotencyKey } from "../automation/contracts";

assert.equal(
  buildEmailAutomationEventKey({ sourceEventId: "CRM-CONTACT:ABC123", trigger: "NEW_LEAD" }),
  "email:event:crm-contact:abc123:new_lead",
);
assert.deepEqual(EMAIL_EVENT_STATUS, ["PENDING", "PROCESSING", "PROCESSED", "FAILED"]);
assert.equal(
  buildEmailAutomationIdempotencyKey({
    workspaceId: "workspace-1",
    automationId: "flow-1",
    automationVersion: 2,
    triggerEventId: "event-1",
    contactId: "contact-1",
    actionNodeId: "send-welcome",
  }),
  "email:auto:workspace-1:flow-1:2:event-1:contact-1:send-welcome",
);
assert.throws(
  () => buildEmailAutomationEventKey({ sourceEventId: " ", trigger: "FORM_SUBMITTED" }),
  /sourceEventId is required/i,
);
console.log("Email automation E4 event outbox contracts: PASS");
assert.doesNotThrow(() => assertEmailAutomationEventRequeueAllowed("FAILED", 0, 5));
assert.throws(() => assertEmailAutomationEventRequeueAllowed("PENDING", 1, 5), /Only FAILED/);
assert.throws(() => assertEmailAutomationEventRequeueAllowed("FAILED", 5, 5), /retry limit/);
