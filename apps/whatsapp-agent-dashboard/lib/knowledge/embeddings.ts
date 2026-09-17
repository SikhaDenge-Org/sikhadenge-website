const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_TIMEOUT_MS = 30_000;

type EmbeddingResponse = {
  data?: Array<{ index?: number; embedding?: number[] }>;
  error?: { message?: string };
};

export function getKnowledgeEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

export async function createKnowledgeEmbeddings(
  inputs: string[],
): Promise<{ model: string; vectors: number[][] } | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || inputs.length === 0) return null;
  if (inputs.length > 500) throw new Error("Embedding batch exceeds 500 chunks.");

  const model = getKnowledgeEmbeddingModel();
  const controller = new AbortController();
  const configuredTimeout = Number(process.env.OPENAI_EMBEDDING_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.max(5_000, Math.min(120_000, configuredTimeout))
    : DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: inputs, encoding_format: "float" }),
      signal: controller.signal,
    });
    const payload = (await response.json()) as EmbeddingResponse;
    if (!response.ok) {
      throw new Error(
        payload.error?.message || `Embedding request failed with status ${response.status}.`,
      );
    }

    const ordered = (payload.data ?? [])
      .slice()
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
    const vectors = ordered.map((item) => item.embedding ?? []);
    if (
      vectors.length !== inputs.length ||
      vectors.some(
        (vector) =>
          vector.length === 0 || vector.some((value) => !Number.isFinite(value)),
      )
    ) {
      throw new Error("Embedding response was incomplete or invalid.");
    }
    return { model, vectors };
  } finally {
    clearTimeout(timeout);
  }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftMagnitude += a * a;
    rightMagnitude += b * b;
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  if (!denominator) return 0;
  return Math.max(-1, Math.min(1, dot / denominator));
}

export function embeddingFromMetadata(metadata: unknown): number[] | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const candidate = (metadata as Record<string, unknown>).embedding;
  if (!Array.isArray(candidate) || candidate.length === 0) return null;
  const vector = candidate.filter((value): value is number => typeof value === "number");
  return vector.length === candidate.length ? vector : null;
}
