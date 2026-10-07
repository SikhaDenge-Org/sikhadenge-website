import assert from "node:assert/strict";

import { validateTemplateSampleFile } from "../lib/templates/template-media-service";

{
  const result = validateTemplateSampleFile({
    mimeType: "image/jpeg",
    size: 1024,
    requestedFormat: "IMAGE",
  });
  assert.equal(result.format, "IMAGE");
  assert.equal(result.mimeType, "image/jpeg");
}

{
  const result = validateTemplateSampleFile({
    mimeType: "video/mp4",
    size: 1024,
    requestedFormat: "VIDEO",
  });
  assert.equal(result.format, "VIDEO");
}

{
  const result = validateTemplateSampleFile({
    mimeType: "application/pdf",
    size: 1024,
    requestedFormat: "DOCUMENT",
  });
  assert.equal(result.format, "DOCUMENT");
}

assert.throws(
  () =>
    validateTemplateSampleFile({
      mimeType: "image/jpeg",
      size: 1024,
      requestedFormat: "VIDEO",
    }),
  /does not match the VIDEO header type/u,
);

assert.throws(
  () =>
    validateTemplateSampleFile({
      mimeType: "image/gif",
      size: 1024,
      requestedFormat: "IMAGE",
    }),
  /Supported sample files/u,
);

assert.throws(
  () =>
    validateTemplateSampleFile({
      mimeType: "image/png",
      size: 6 * 1024 * 1024,
      requestedFormat: "IMAGE",
    }),
  /maximum allowed is 5 MB/iu,
);

console.log("PASS: template-media-service");
