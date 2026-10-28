import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(p:string)=>readFileSync(p,"utf8");
const base="";
const page=read(base+"app/email/readiness/page.tsx");
const view=read(base+"modules/email-automation/ui/EmailReadinessDashboard.tsx");
const nav=read(base+"modules/email-automation/ui/EmailWorkspaceNav.tsx");
const api=read(base+"app/api/email/platform/overview/route.ts");
assert.match(page,/requireDashboardUser\(\[DashboardRole.ADMIN,DashboardRole.MANAGER\]\)/);
assert.match(nav,/\/email\/readiness/);
assert.match(view,/api\/email\/platform\/overview/);
assert.match(view,/cache:"no-store"/);
assert.match(view,/credentials:"same-origin"/);
assert.doesNotMatch(view,/method:\s*"(POST|PUT|PATCH|DELETE)"/);
assert.match(api,/requireEmailManagerAccess\(\)/);
assert.match(api,/Cache-Control":"no-store"/);
for(const key of ["runtimeMode","externalWritesEnabled","inboundSyncEnabled","trackingEnabled"]){assert.match(view,new RegExp(key))}
assert.doesNotMatch(page,/wa2i-activate-root|systemctl|prisma\.migrate/);
console.log("EMAIL_PRODUCTION_READINESS_CONTRACT=PASS");
