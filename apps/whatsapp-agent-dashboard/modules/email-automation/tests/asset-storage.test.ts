import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  deleteEmailAsset,
  newEmailAssetId,
  persistEmailAsset,
  readEmailAsset,
  validateEmailAsset,
} from "../infrastructure/email-template-asset-storage";

async function run() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sikhadenge-email-assets-"));
  process.env.EMAIL_TEMPLATE_ASSET_STORAGE_DIR = directory;
  try {
    const image = new File([Buffer.from("safe-image-bytes")], "hero.png", { type: "image/png" });
    validateEmailAsset(image, "INLINE_IMAGE");
    assert.throws(() => validateEmailAsset(new File(["x"], "bad.svg", { type: "image/svg+xml" }), "INLINE_IMAGE"), /unsupported/i);

    const assetId = newEmailAssetId();
    const storageKey = await persistEmailAsset({ workspaceId: "workspace_123", assetId, file: image });
    const restored = await readEmailAsset(storageKey);
    assert.equal(restored.toString(), "safe-image-bytes");

    const absolute = path.join(directory, storageKey);
    await writeFile(absolute, Buffer.from("tampered"));
    await assert.rejects(() => readEmailAsset(storageKey), /integrity/i);
    await deleteEmailAsset(storageKey);
    await deleteEmailAsset(storageKey);
  } finally {
    await rm(directory, { recursive: true, force: true });
    delete process.env.EMAIL_TEMPLATE_ASSET_STORAGE_DIR;
  }
  console.log("Email automation E2 asset storage contracts: PASS");
}

void run();