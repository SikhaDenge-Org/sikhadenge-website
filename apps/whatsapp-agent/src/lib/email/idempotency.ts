export function buildEmailIdempotencyKey(parts: Array<string | number | null | undefined>): string {
  const normalized = parts
    .filter((part): part is string | number => part !== null && part !== undefined)
    .map((part) => String(part).trim().toLowerCase())
    .filter(Boolean);

  if (normalized.length === 0) throw new Error("Email idempotency key requires at least one part.");
  return `email:${normalized.join(":")}`;
}
