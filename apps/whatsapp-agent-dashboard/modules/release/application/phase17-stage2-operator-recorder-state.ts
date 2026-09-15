export type Phase17OperatorRecorderState = {
  stage: string;
  mode: string;
  writePolicy: string;
  externalWritesAllowed: boolean;
  version: number;
};

export type Phase17OperatorRecorderBaseline = "STAGE1" | "STAGE2";

export function resolvePhase17OperatorRecorderBaseline(
  state: Phase17OperatorRecorderState | null | undefined,
  transitionCount: number,
): Phase17OperatorRecorderBaseline {
  const stage1 =
    state?.stage === "INTERNAL_TEST_IDENTITIES" &&
    state.mode === "SHADOW" &&
    state.writePolicy === "NO_EXTERNAL_WRITES" &&
    state.externalWritesAllowed === false &&
    state.version === 1 &&
    transitionCount === 1;

  if (stage1) return "STAGE1";

  const stage2 =
    state?.stage === "ONE_CONNECTED_ACCOUNT" &&
    state.mode === "SHADOW" &&
    state.writePolicy === "NO_EXTERNAL_WRITES" &&
    state.externalWritesAllowed === false &&
    state.version === 2 &&
    transitionCount === 2;

  if (stage2) return "STAGE2";

  throw new Error(
    "Operator evidence recorder requires exact Stage1 or Stage2 SHADOW no-external-writes baseline.",
  );
}
