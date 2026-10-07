import assert from "node:assert/strict";

import { evaluateGoldenCases } from "../lib/evaluation/evaluator";
import { GOLDEN_AGENT_CASES } from "../lib/evaluation/golden-cases";

const evaluation = evaluateGoldenCases(GOLDEN_AGENT_CASES);

if (evaluation.failed > 0) {
  for (const result of evaluation.results.filter((entry) => !entry.passed)) {
    console.error(`EVAL_FAILURE=${result.id}:${result.failures.join(" | ")}`);
  }
}

assert.equal(evaluation.total, 20);
assert.equal(evaluation.failed, 0);
assert.equal(evaluation.passRate, 1);

console.log(`EVALUATION_SMOKE_PASS=${evaluation.passed}`);
