import { provisionLifecycleEmailAutomation } from "../modules/email-automation/automation/lifecycle-provisioning";

async function main() {
  const result = await provisionLifecycleEmailAutomation();
  console.log(JSON.stringify({
    workspaceId: result.workspaceId,
    templatesCreated: result.templates.filter((item) => item.created).length,
    flowsCreated: result.flows.filter((item) => item.created).length,
    totalTemplates: result.templates.length,
    totalFlows: result.flows.length,
    activated: result.activated,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
