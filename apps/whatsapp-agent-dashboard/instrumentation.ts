export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { getMasterclassFlowConfig } = await import(
      "./lib/automation/masterclass-registration-flow"
    );
    const config = await getMasterclassFlowConfig();
    process.env.MASTERCLASS_NAME = "Free AI Expert Masterclass";
    process.env.MASTERCLASS_DATE_LABEL = `${config.classDay}, ${config.classDate}`;
    process.env.MASTERCLASS_TIME_LABEL = config.classTime;
    process.env.MASTERCLASS_COMMUNITY_URL = config.communityLink;
  } catch (error) {
    console.error(
      "[masterclass-flow] runtime configuration bootstrap failed:",
      error instanceof Error ? error.message : error,
    );
  }
}
