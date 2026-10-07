type SupportedTemplateMedia = {
  format: "IMAGE" | "VIDEO" | "DOCUMENT";
  maximumBytes: number;
};

const SUPPORTED_MEDIA: Record<string, SupportedTemplateMedia> = {
  "image/jpeg": { format: "IMAGE", maximumBytes: 5 * 1024 * 1024 },
  "image/png": { format: "IMAGE", maximumBytes: 5 * 1024 * 1024 },
  "image/webp": { format: "IMAGE", maximumBytes: 5 * 1024 * 1024 },
  "video/mp4": { format: "VIDEO", maximumBytes: 16 * 1024 * 1024 },
  "application/pdf": { format: "DOCUMENT", maximumBytes: 20 * 1024 * 1024 },
};

type CreateUploadSessionResponse = {
  id?: string;
  error?: { message?: string; code?: number };
};

type UploadFileResponse = {
  h?: string;
  error?: { message?: string; code?: number };
};

function templateMediaConfig() {
  const accessToken =
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
    process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();
  const appId =
    process.env.WHATSAPP_APP_ID?.trim() || process.env.META_APP_ID?.trim();
  const graphVersion =
    process.env.WHATSAPP_GRAPH_VERSION?.trim() ||
    process.env.META_GRAPH_API_VERSION?.trim();

  if (!accessToken) throw new Error("WhatsApp access token is not configured.");
  if (!appId) throw new Error("WhatsApp Meta App ID is not configured.");
  if (!graphVersion) throw new Error("Meta Graph API version is not configured.");
  return { accessToken, appId, graphVersion };
}

function cleanFileName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._()\- ]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || "template-sample").slice(0, 150);
}

async function parseMetaResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & {
    error?: { message?: string; code?: number };
  };
  if (!response.ok) {
    const suffix = payload.error?.code ? ` (${payload.error.code})` : "";
    throw new Error(
      `${payload.error?.message || `Meta request failed with HTTP ${response.status}`}${suffix}`,
    );
  }
  return payload;
}

export function validateTemplateSampleFile(input: {
  mimeType: string;
  size: number;
  requestedFormat: string;
}) {
  const mimeType = input.mimeType.trim().toLowerCase();
  const rule = SUPPORTED_MEDIA[mimeType];
  if (!rule) {
    throw new Error("Supported sample files: JPG, PNG, WEBP, MP4 and PDF.");
  }
  const requestedFormat = input.requestedFormat.trim().toUpperCase();
  if (rule.format !== requestedFormat) {
    throw new Error(`Selected file does not match the ${requestedFormat} header type.`);
  }
  if (input.size <= 0) throw new Error("Uploaded sample file is empty.");
  if (input.size > rule.maximumBytes) {
    throw new Error(
      `${rule.format} sample is too large. Maximum allowed is ${Math.floor(
        rule.maximumBytes / (1024 * 1024),
      )} MB.`,
    );
  }
  return { mimeType, format: rule.format, maximumBytes: rule.maximumBytes };
}

export async function uploadTemplateSampleToMeta(input: {
  file: File;
  requestedFormat: string;
}) {
  const validation = validateTemplateSampleFile({
    mimeType: input.file.type,
    size: input.file.size,
    requestedFormat: input.requestedFormat,
  });
  const config = templateMediaConfig();
  const fileName = cleanFileName(input.file.name);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const sessionUrl = new URL(
      `https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${encodeURIComponent(config.appId)}/uploads`,
    );
    sessionUrl.searchParams.set("file_name", fileName);
    sessionUrl.searchParams.set("file_length", String(input.file.size));
    sessionUrl.searchParams.set("file_type", validation.mimeType);

    const sessionResponse = await fetch(sessionUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}` },
      cache: "no-store",
      signal: controller.signal,
    });
    const session = await parseMetaResponse<CreateUploadSessionResponse>(sessionResponse);
    if (!session.id) throw new Error("Meta did not return an upload session ID.");

    const fileData = Buffer.from(await input.file.arrayBuffer());
    if (fileData.byteLength !== input.file.size) {
      throw new Error("Template sample file size could not be verified.");
    }

    const uploadResponse = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(config.graphVersion)}/${session.id}`,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${config.accessToken}`,
          "Content-Type": validation.mimeType,
          file_offset: "0",
        },
        body: fileData,
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const uploaded = await parseMetaResponse<UploadFileResponse>(uploadResponse);
    if (!uploaded.h) throw new Error("Meta did not return a media header handle.");

    return {
      headerHandle: uploaded.h,
      fileName,
      mimeType: validation.mimeType,
      format: validation.format,
      size: input.file.size,
    };
  } finally {
    clearTimeout(timeout);
  }
}
