import assert from "node:assert/strict";

import {
  emailAutomationSchedulerToken,
  isEmailAutomationSchedulerAuthorized,
} from "../automation/scheduler-auth";

assert.equal(emailAutomationSchedulerToken({}), "");
assert.equal(emailAutomationSchedulerToken({ EMAIL_AUTOMATION_SCHEDULER_TOKEN: "  scheduler-secret  " }), "scheduler-secret");
assert.equal(isEmailAutomationSchedulerAuthorized(null, "scheduler-secret"), false);
assert.equal(isEmailAutomationSchedulerAuthorized("Basic abc", "scheduler-secret"), false);
assert.equal(isEmailAutomationSchedulerAuthorized("Bearer wrong", "scheduler-secret"), false);
assert.equal(isEmailAutomationSchedulerAuthorized("Bearer scheduler-secret", "scheduler-secret"), true);
assert.equal(isEmailAutomationSchedulerAuthorized("bearer scheduler-secret", "scheduler-secret"), true);
assert.equal(isEmailAutomationSchedulerAuthorized("Bearer scheduler-secret", ""), false);

console.log("Email automation E4 scheduler auth contracts: PASS");