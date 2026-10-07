import assert from "node:assert/strict";

import {
  knowledgeChecksum,
  normalizeKnowledgeText,
  prepareKnowledgeChunks,
} from "../lib/knowledge/text-processing";

const source = `# AI Expert Program

Duration: 10 weeks.
Classes: 3 classes per week.

## Fees

The approved fee must be published by the SikhaDenge team.

## Certificate

Certificate details must come from approved knowledge only.`;

const normalized = normalizeKnowledgeText(source);
assert.ok(normalized.includes("AI Expert Program"));
assert.equal(knowledgeChecksum(source), knowledgeChecksum(normalized));

const chunks = prepareKnowledgeChunks(source, {
  maxChars: 500,
  overlapChars: 50,
});

assert.ok(chunks.length >= 3);
assert.equal(new Set(chunks.map((chunk) => chunk.checksum)).size, chunks.length);
assert.ok(chunks.every((chunk) => chunk.content.length > 0));
assert.ok(chunks.every((chunk) => chunk.metadata.sourceChecksum.length === 64));
assert.deepEqual(
  chunks.map((chunk) => chunk.metadata.ordinal),
  chunks.map((_, index) => index),
);

const reconstructedContent = chunks.map((chunk) => chunk.content).join("\n");
assert.ok(reconstructedContent.includes("Duration: 10 weeks."));
assert.ok(
  reconstructedContent.includes(
    "The approved fee must be published by the SikhaDenge team.",
  ),
);
assert.ok(
  reconstructedContent.includes(
    "Certificate details must come from approved knowledge only.",
  ),
);

const longText = `Course Details\n\n${"This is an approved knowledge paragraph. ".repeat(80)}`;
const longChunks = prepareKnowledgeChunks(longText, {
  maxChars: 600,
  overlapChars: 80,
});
assert.ok(longChunks.length > 1);
assert.ok(longChunks.every((chunk) => chunk.content.length <= 600));

console.log(`KNOWLEDGE_SMOKE_PASS=${chunks.length + longChunks.length + 10}`);
