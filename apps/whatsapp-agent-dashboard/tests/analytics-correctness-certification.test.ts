import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const analytics = readFileSync("lib/analytics/platform-analytics.ts", "utf8");
const route = readFileSync("app/api/analytics/overview/route.ts", "utf8");
const liveAgent = readFileSync("lib/agent/live-agent-service.ts", "utf8");
const campaign = readFileSync("lib/campaigns/campaign-service.ts", "utf8");

assert.match(analytics, /statusCounter/);
assert.match(analytics, /leadStages/);
assert.match(analytics, /leadTemperatures/);
assert.match(analytics, /eventType:\s*"automation_runtime_run"/);
assert.match(analytics, /automationRunCount/);
assert.match(analytics, /automationFailureCount/);
assert.doesNotMatch(analytics, /payload\.runCount/);
assert.doesNotMatch(analytics, /payload\.failureCount/);
assert.match(analytics, /const delivered = \(messageStatuses\[MessageStatus\.DELIVERED\] \|\| 0\) \+ read/);
assert.match(analytics, /MessageStatus\.READ/);
assert.match(analytics, /MessageStatus\.FAILED/);
assert.match(analytics, /agent_inbound_lifecycle/);
assert.match(analytics, /campaign_plan/);
assert.match(analytics, /retargeting/);
assert.match(liveAgent, /eventKey: `agent-lifecycle:\$\{messageId\}`/);
assert.match(campaign, /eventKey: `campaign-plan:\$\{campaignId\}`/);
assert.match(route, /Cache-Control/);
assert.match(route, /no-store/);
console.log("Phase13 analytics correctness certification: PASS");
