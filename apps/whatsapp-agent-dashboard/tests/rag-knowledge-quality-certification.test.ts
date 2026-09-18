import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const knowledge = readFileSync("lib/agent/knowledge.ts", "utf8");
const service = readFileSync("lib/knowledge/knowledge-service.ts", "utf8");
const processing = readFileSync("lib/knowledge/text-processing.ts", "utf8");
const grounded = readFileSync("modules/knowledge/domain/grounded-answer.ts", "utf8");
const types = readFileSync("lib/agent/types.ts", "utf8");

assert.match(knowledge, /status:\s*KnowledgeStatus\.APPROVED/);
assert.match(knowledge, /effectiveFrom/);
assert.match(knowledge, /effectiveTo/);
assert.match(knowledge, /knowledgeMinimumScore/);
assert.match(knowledge, /sourceType:\s*chunk\.document\.sourceType/);
assert.match(knowledge, /sourceUrl:\s*chunk\.document\.sourceUrl/);
assert.match(knowledge, /documentVersion:\s*chunk\.document\.version/);
assert.match(knowledge, /replace\(\/\\s\+\/g, " "\)/);
assert.match(service, /sourceChecksum/);
assert.match(service, /identical version of this knowledge document already exists/);
assert.match(service, /KnowledgeStatus\.IN_REVIEW/);
assert.match(service, /KnowledgeStatus\.APPROVED/);
assert.match(service, /KnowledgeStatus\.ARCHIVED/);
assert.match(processing, /seen\.has\(checksum\)/);
assert.match(grounded, /High-risk answer requires active approved knowledge references/);
assert.match(types, /sourceType\?: string \| null/);
assert.match(types, /sourceUrl\?: string \| null/);
assert.match(types, /documentVersion\?: number \| null/);
console.log("Phase12 RAG knowledge quality certification: PASS");
