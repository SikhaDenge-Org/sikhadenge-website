import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type EmailAssetKind = "INLINE_IMAGE" | "ATTACHMENT" | "DOCUMENT";

const RULES: Record<string, { kinds: readonly EmailAssetKind[]; max: number }> = {
  "image/jpeg": { kinds: ["INLINE_IMAGE", "ATTACHMENT"], max: 5 * 1024 * 1024 },
  "image/png": { kinds: ["INLINE_IMAGE", "ATTACHMENT"], max: 5 * 1024 * 1024 },
  "image/webp": { kinds: ["INLINE_IMAGE", "ATTACHMENT"], max: 5 * 1024 * 1024 },
  "application/pdf": { kinds: ["DOCUMENT", "ATTACHMENT"], max: 20 * 1024 * 1024 },
  "application/msword": { kinds: ["DOCUMENT", "ATTACHMENT"], max: 20 * 1024 * 1024 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { kinds: ["DOCUMENT", "ATTACHMENT"], max: 20 * 1024 * 1024 },
  "application/vnd.ms-excel": { kinds: ["DOCUMENT", "ATTACHMENT"], max: 20 * 1024 * 1024 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { kinds: ["DOCUMENT", "ATTACHMENT"], max: 20 * 1024 * 1024 },
  "application/vnd.ms-powerpoint": { kinds: ["DOCUMENT", "ATTACHMENT"], max: 20 * 1024 * 1024 },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { kinds: ["DOCUMENT", "ATTACHMENT"], max: 20 * 1024 * 1024 },
  "text/plain": { kinds: ["DOCUMENT", "ATTACHMENT"], max: 5 * 1024 * 1024 },
};

function root(): string {
  return process.env.EMAIL_TEMPLATE_ASSET_STORAGE_DIR?.trim() || "/var/www/sikhadenge-whatsapp-agent/storage/email-template-assets";
}

function safeSegment(value: string): string {
  const clean = value.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(clean)) throw new Error("Invalid email asset storage segment.");
  return clean;
}

export function validateEmailAsset(file: File, kind: EmailAssetKind): void {
  const rule = RULES[file.type.toLowerCase()];
  if (!rule || !rule.kinds.includes(kind)) throw new Error("Unsupported file type for this email asset kind.");
  if (file.size <= 0) throw new Error("Uploaded email asset is empty.");
  if (file.size > rule.max) throw new Error(`Email asset exceeds the ${Math.floor(rule.max / 1048576)} MB limit.`);
}

export async function persistEmailAsset(input: { workspaceId: string; assetId: string; file: File }): Promise<string> {
  const workspace = safeSegment(input.workspaceId);
  const assetId = safeSegment(input.assetId);
  const data = Buffer.from(await input.file.arrayBuffer());
  if (data.byteLength !== input.file.size) throw new Error("Email asset size verification failed.");
  const sha256 = createHash("sha256").update(data).digest("hex");
  const directory = path.join(root(), workspace);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const storageKey = `${workspace}/${assetId}-${sha256}.bin`;
  await writeFile(path.join(root(), storageKey), data, { mode: 0o600, flag: "wx" });
  return storageKey;
}

export async function deleteEmailAsset(storageKey: string): Promise<void> {
  const match = /^([A-Za-z0-9_-]{8,128})\/([A-Za-z0-9_-]{8,128})-([a-f0-9]{64})\.bin$/.exec(storageKey);
  if (!match) throw new Error("Invalid email asset storage key.");
  await unlink(path.join(root(), storageKey)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
export async function readEmailAsset(storageKey: string): Promise<Buffer> {
  const match = /^([A-Za-z0-9_-]{8,128})\/([A-Za-z0-9_-]{8,128})-([a-f0-9]{64})\.bin$/.exec(storageKey);
  if (!match) throw new Error("Invalid email asset storage key.");
  const data = await readFile(path.join(root(), storageKey));
  const sha256 = createHash("sha256").update(data).digest("hex");
  if (sha256 !== match[3]) throw new Error("Email asset integrity verification failed.");
  return data;
}

export function newEmailAssetId(): string {
  return randomUUID().replaceAll("-", "");
}
