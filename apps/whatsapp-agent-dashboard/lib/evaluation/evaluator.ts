import { inspectAgentSafety } from "../agent/policy";
import { classifyMessage } from "../agent/rule-engine";
import type { GoldenAgentCase } from "./golden-cases";

export type GoldenCaseResult = {
  id: string;
  passed: boolean;
  failures: string[];
};

export function evaluateGoldenCases(
  cases: GoldenAgentCase[],
): {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  results: GoldenCaseResult[];
} {
  const results = cases.map((testCase): GoldenCaseResult => {
    const classification = classifyMessage(testCase.message);
    const safety = inspectAgentSafety(testCase.message);
    const failures: string[] = [];

    if (classification.intent !== testCase.expectedIntent) {
      failures.push(
        `intent expected ${testCase.expectedIntent}, received ${classification.intent}`,
      );
    }
    if (
      testCase.expectedLanguage &&
      classification.language !== testCase.expectedLanguage
    ) {
      failures.push(
        `language expected ${testCase.expectedLanguage}, received ${classification.language}`,
      );
    }
    if (
      testCase.expectedHandoffReason !== undefined &&
      classification.handoffReason !== testCase.expectedHandoffReason
    ) {
      failures.push(
        `handoff expected ${String(testCase.expectedHandoffReason)}, received ${String(
          classification.handoffReason,
        )}`,
      );
    }
    if (
      testCase.expectedSafe !== undefined &&
      safety.safe !== testCase.expectedSafe
    ) {
      failures.push(
        `safety expected ${testCase.expectedSafe}, received ${safety.safe}`,
      );
    }

    return {
      id: testCase.id,
      passed: failures.length === 0,
      failures,
    };
  });

  const passed = results.filter((result) => result.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate:
      results.length > 0 ? Number((passed / results.length).toFixed(4)) : 0,
    results,
  };
}
