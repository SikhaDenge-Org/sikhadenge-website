export type PhaseReadiness = {
  phase: number;
  name: string;
  repositoryImplemented: boolean;
  productionEvidenceReady: boolean;
  live: boolean;
  blockers: readonly string[];
};

type Environment = Readonly<Record<string, string | undefined>>;

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

const PHASE_NAMES: Record<number, string> = {
  10: "AI Brain & Knowledge",
  11: "Customer 360",
  12: "Journeys",
  13: "Analytics",
  14: "Official Connectors",
  15: "PWA & Productivity",
  16: "SaaS & Enterprise",
  17: "Controlled Launch",
};

export function buildRemainingPhaseReadiness(
  env: Environment = process.env,
): readonly PhaseReadiness[] {
  return Object.entries(PHASE_NAMES).map(([phaseText, name]) => {
    const phase = Number(phaseText);
    const productionEvidenceReady = enabled(env[`ENGAGEOS_PHASE${phase}_PRODUCTION_EVIDENCE`]);
    const live = enabled(env[`ENGAGEOS_PHASE${phase}_LIVE`]);
    const blockers: string[] = [];
    if (!productionEvidenceReady) blockers.push("production evidence not approved");
    if (!live) blockers.push("production activation not recorded");
    return {
      phase,
      name,
      repositoryImplemented: true,
      productionEvidenceReady,
      live: productionEvidenceReady && live,
      blockers,
    };
  });
}

export function remainingRepositoryPhasesComplete(
  phases: readonly PhaseReadiness[],
): boolean {
  return phases.every((phase) => phase.repositoryImplemented);
}

export function remainingProductionPhasesReady(
  phases: readonly PhaseReadiness[],
): boolean {
  return phases.every((phase) => phase.productionEvidenceReady);
}
