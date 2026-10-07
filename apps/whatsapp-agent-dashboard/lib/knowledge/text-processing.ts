import { createHash } from "node:crypto";

export type PreparedKnowledgeChunk = {
  heading: string | null;
  content: string;
  checksum: string;
  metadata: {
    ordinal: number;
    characterCount: number;
    sourceChecksum: string;
  };
};

const DEFAULT_MAX_CHARS = 1_400;
const DEFAULT_OVERLAP_CHARS = 180;

export function normalizeKnowledgeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00A0]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function knowledgeChecksum(value: string): string {
  return createHash("sha256")
    .update(normalizeKnowledgeText(value), "utf8")
    .digest("hex");
}

function isHeading(line: string): boolean {
  const compact = line.trim();
  if (!compact || compact.length > 120) return false;
  if (/^#{1,6}\s+/.test(compact)) return true;
  if (/^[A-Z0-9][A-Z0-9 &/():-]{3,}$/.test(compact)) return true;
  if (/^(module|course|fees?|batch|timings?|certificate|policy|eligibility|admission|demo)\b/i.test(compact)) {
    // Keyword-led prose such as "Certificate details must come from..." is
    // document content, not a heading. Terminal sentence punctuation is a
    // strong, language-neutral signal that prevents that content from being
    // silently dropped when the following section has no body.
    if (/[.!?]$/.test(compact)) return false;
    return compact.endsWith(":") || compact.split(/\s+/).length <= 9;
  }
  return false;
}

function cleanHeading(line: string): string {
  return line.replace(/^#{1,6}\s+/, "").replace(/:$/, "").trim();
}

function splitSections(text: string): Array<{ heading: string | null; body: string }> {
  const sections: Array<{ heading: string | null; body: string }> = [];
  let heading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const body = normalizeKnowledgeText(buffer.join("\n"));
    if (body) sections.push({ heading, body });
    buffer = [];
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (isHeading(line)) {
      flush();
      heading = cleanHeading(line);
      continue;
    }
    buffer.push(rawLine);
  }
  flush();
  return sections;
}

function splitLongBody(body: string, maxChars: number, overlapChars: number): string[] {
  if (body.length <= maxChars) return [body];

  const paragraphs = body.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const normalized = normalizeKnowledgeText(current);
    if (!normalized) return;
    chunks.push(normalized);
    current = normalized.slice(Math.max(0, normalized.length - overlapChars));
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) pushCurrent();
      for (let start = 0; start < paragraph.length; start += maxChars - overlapChars) {
        chunks.push(paragraph.slice(start, start + maxChars).trim());
      }
      current = "";
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars && current) pushCurrent();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }

  if (current.trim()) chunks.push(normalizeKnowledgeText(current));
  return chunks.filter(Boolean);
}

export function prepareKnowledgeChunks(
  input: string,
  options: { maxChars?: number; overlapChars?: number } = {},
): PreparedKnowledgeChunk[] {
  const normalized = normalizeKnowledgeText(input);
  if (!normalized) return [];

  const maxChars = Math.max(500, Math.min(3_000, options.maxChars ?? DEFAULT_MAX_CHARS));
  const overlapChars = Math.max(
    0,
    Math.min(Math.floor(maxChars / 3), options.overlapChars ?? DEFAULT_OVERLAP_CHARS),
  );
  const sourceChecksum = knowledgeChecksum(normalized);
  const seen = new Set<string>();
  const output: PreparedKnowledgeChunk[] = [];

  for (const section of splitSections(normalized)) {
    for (const body of splitLongBody(section.body, maxChars, overlapChars)) {
      const content = normalizeKnowledgeText(body);
      const checksum = knowledgeChecksum(`${section.heading ?? ""}\n${content}`);
      if (!content || seen.has(checksum)) continue;
      seen.add(checksum);
      output.push({
        heading: section.heading,
        content,
        checksum,
        metadata: {
          ordinal: output.length,
          characterCount: content.length,
          sourceChecksum,
        },
      });
    }
  }

  return output;
}
