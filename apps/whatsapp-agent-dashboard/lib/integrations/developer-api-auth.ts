import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function authenticateDeveloperApi(request: Request): boolean {
  const expected = process.env.DEVELOPER_API_TOKEN?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization")?.trim() || "";
  const supplied = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!supplied) return false;
  return timingSafeEqual(digest(supplied), digest(expected));
}
