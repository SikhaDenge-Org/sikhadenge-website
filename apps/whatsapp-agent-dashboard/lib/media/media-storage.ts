import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type MediaKind = "image" | "document" | "video" | "audio";

export type StoredMediaAsset = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  kind: MediaKind;
  size: number;
  sha256: string;
  createdAt: string;
};

const MIME_RULES: Record<string, { kind: MediaKind; maximumBytes: number }> = {
  "image/jpeg": { kind: "image", maximumBytes: 5 * 1024 * 1024 },
  "image/png": { kind: "image", maximumBytes: 5 * 1024 * 1024 },
  "image/webp": { kind: "image", maximumBytes: 5 * 1024 * 1024 },
  "application/pdf": { kind: "document", maximumBytes: 20 * 1024 * 1024 },
  "application/msword": { kind: "document", maximumBytes: 20 * 1024 * 1024 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    kind: "document",
    maximumBytes: 20 * 1024 * 1024,
  },
  "application/vnd.ms-excel": { kind: "document", maximumBytes: 20 * 1024 * 1024 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    kind: "document",
    maximumBytes: 20 * 1024 * 1024,
  },
  "application/vnd.ms-powerpoint": { kind: "document", maximumBytes: 20 * 1024 * 1024 },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    kind: "document",
    maximumBytes: 20 * 1024 * 1024,
  },
  "text/plain": { kind: "document", maximumBytes: 5 * 1024 * 1024 },
  "video/mp4": { kind: "video", maximumBytes: 16 * 1024 * 1024 },
  "audio/mpeg": { kind: "audio", maximumBytes: 16 * 1024 * 1024 },
  "audio/mp4": { kind: "audio", maximumBytes: 16 * 1024 * 1024 },
  "audio/ogg": { kind: "audio", maximumBytes: 16 * 1024 * 1024 },
  "audio/aac": { kind: "audio", maximumBytes: 16 * 1024 * 1024 },
};

function storageDirectory(): string {
  return (
    process.env.WHATSAPP_MEDIA_STORAGE_DIR?.trim() ||
    "/var/www/sikhadenge-whatsapp-agent/storage/media"
  );
}

function safeOriginalName(value: string): string {
  const base = path.basename(value || "attachment");
  const cleaned = base
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._()\- ]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "attachment").slice(0, 180);
}

function assertAssetId(value: string): string {
  const id = value.trim();
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Invalid media asset ID.");
  return id;
}

function metadataPath(id: string): string {
  return path.join(storageDirectory(), `${assertAssetId(id)}.json`);
}

function binaryPath(asset: StoredMediaAsset): string {
  return path.join(storageDirectory(), asset.storedName);
}

export function supportedMediaDescription(): string {
  return "JPG, PNG, WEBP, PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, MP4 and supported audio";
}

export async function saveMediaUpload(file: File): Promise<StoredMediaAsset> {
  const mimeType = file.type.trim().toLowerCase();
  const rule = MIME_RULES[mimeType];
  if (!rule) {
    throw new Error(`Unsupported file type. Allowed: ${supportedMediaDescription()}.`);
  }
  if (file.size <= 0) throw new Error("Uploaded file is empty.");
  if (file.size > rule.maximumBytes) {
    throw new Error(
      `File is too large. Maximum allowed for ${rule.kind} is ${Math.floor(
        rule.maximumBytes / (1024 * 1024),
      )} MB.`,
    );
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (data.byteLength !== file.size) throw new Error("Uploaded file size could not be verified.");

  const id = randomBytes(16).toString("hex");
  const originalName = safeOriginalName(file.name);
  const storedName = `${id}.bin`;
  const asset: StoredMediaAsset = {
    id,
    originalName,
    storedName,
    mimeType,
    kind: rule.kind,
    size: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
    createdAt: new Date().toISOString(),
  };

  const directory = storageDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const binaryTemporary = path.join(directory, `${storedName}.tmp`);
  const metadataTemporary = path.join(directory, `${id}.json.tmp`);
  await writeFile(binaryTemporary, data, { mode: 0o600, flag: "wx" });
  await writeFile(metadataTemporary, JSON.stringify(asset), { mode: 0o600, flag: "wx" });
  await rename(binaryTemporary, binaryPath(asset));
  await rename(metadataTemporary, metadataPath(id));
  return asset;
}

export async function loadMediaAsset(assetId: string): Promise<StoredMediaAsset> {
  const raw = await readFile(metadataPath(assetId), "utf8");
  const asset = JSON.parse(raw) as StoredMediaAsset;
  if (asset.id !== assertAssetId(assetId)) throw new Error("Media metadata is invalid.");
  if (!MIME_RULES[asset.mimeType] || MIME_RULES[asset.mimeType].kind !== asset.kind) {
    throw new Error("Stored media type is invalid.");
  }
  return asset;
}

export async function readMediaAsset(assetId: string): Promise<{
  asset: StoredMediaAsset;
  data: Buffer;
}> {
  const asset = await loadMediaAsset(assetId);
  const data = await readFile(binaryPath(asset));
  if (data.byteLength !== asset.size) throw new Error("Stored media size validation failed.");
  const checksum = createHash("sha256").update(data).digest("hex");
  if (checksum !== asset.sha256) throw new Error("Stored media checksum validation failed.");
  return { asset, data };
}

export function dashboardMediaUrl(assetId: string): string {
  return `/api/media/${encodeURIComponent(assertAssetId(assetId))}`;
}
