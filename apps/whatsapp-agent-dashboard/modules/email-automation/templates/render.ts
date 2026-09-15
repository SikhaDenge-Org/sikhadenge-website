import type { EmailRenderedContent } from "../domain/contracts";
import type {
  EmailTemplateBlock,
  EmailTemplateDocument,
  EmailTextAlign,
} from "./blocks";
import { assertEmailTemplateDocument, assertSafeEmailUrl } from "./validation";

const TOKEN = /{{\s*([A-Za-z][A-Za-z0-9_.-]{0,63})\s*}}/g;

export type RenderEmailTemplateInput = {
  document: EmailTemplateDocument;
  values?: Readonly<Record<string, string | null | undefined>>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function alignValue(value: EmailTextAlign | undefined): "left" | "center" | "right" {
  switch (value) {
    case "CENTER":
      return "center";
    case "RIGHT":
      return "right";
    default:
      return "left";
  }
}

function resolveVariables(
  document: EmailTemplateDocument,
  values: Readonly<Record<string, string | null | undefined>>,
): Readonly<Record<string, string>> {
  const resolved: Record<string, string> = {};
  for (const variable of document.variables) {
    const supplied = values[variable.key];
    if (supplied !== undefined && supplied !== null && supplied !== "") {
      resolved[variable.key] = String(supplied);
      continue;
    }
    if (variable.fallback !== undefined) {
      resolved[variable.key] = variable.fallback;
      continue;
    }
    if (variable.required) {
      throw new Error(`Required email template variable ${variable.key} is missing.`);
    }
    resolved[variable.key] = "";
  }
  return resolved;
}

function interpolate(value: string, variables: Readonly<Record<string, string>>): string {
  return value.replace(TOKEN, (_token, key: string) => {
    if (!(key in variables)) throw new Error(`Email template variable ${key} is not resolved.`);
    return variables[key];
  });
}

function paragraphHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

function renderBlockHtml(
  block: EmailTemplateBlock,
  variables: Readonly<Record<string, string>>,
): string {
  switch (block.type) {
    case "HEADING": {
      const tag = `h${block.level}`;
      const text = escapeHtml(interpolate(block.text, variables));
      const size = block.level === 1 ? 30 : block.level === 2 ? 24 : 20;
      return `<${tag} style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:${size}px;line-height:1.25;color:#111827;text-align:${alignValue(block.align)};">${text}</${tag}>`;
    }
    case "TEXT": {
      const text = paragraphHtml(interpolate(block.text, variables));
      return `<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#374151;text-align:${alignValue(block.align)};">${text}</p>`;
    }
    case "IMAGE": {
      const src = interpolate(block.src, variables).trim();
      const alt = interpolate(block.alt, variables);
      assertSafeEmailUrl(src, "IMAGE");
      const width = block.width ?? 640;
      const image = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;" />`;
      if (!block.linkUrl) return image;
      const href = interpolate(block.linkUrl, variables).trim();
      assertSafeEmailUrl(href, "LINK");
      return `<a href="${escapeHtml(href)}" style="text-decoration:none;">${image}</a>`;
    }
    case "BUTTON": {
      const label = escapeHtml(interpolate(block.label, variables));
      const href = interpolate(block.url, variables).trim();
      assertSafeEmailUrl(href, "LINK");
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="${alignValue(block.align)}" style="padding:0 0 16px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#2563eb;color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.2;text-decoration:none;">${label}</a></td></tr></table>`;
    }
    case "DIVIDER": {
      const color = block.color ?? "#E5E7EB";
      const thickness = block.thickness ?? 1;
      return `<hr style="margin:8px 0 24px;border:0;border-top:${thickness}px solid ${color};" />`;
    }
    case "SPACER":
      return `<div aria-hidden="true" style="height:${block.height}px;line-height:${block.height}px;font-size:1px;">&nbsp;</div>`;
    case "HTML":
      return interpolate(block.html, variables);
  }
}

function renderBlockText(
  block: EmailTemplateBlock,
  variables: Readonly<Record<string, string>>,
): string {
  switch (block.type) {
    case "HEADING":
    case "TEXT":
      return interpolate(block.text, variables).trim();
    case "IMAGE":
      return `[Image: ${interpolate(block.alt, variables).trim()}]`;
    case "BUTTON": {
      const href = interpolate(block.url, variables).trim();
      assertSafeEmailUrl(href, "LINK");
      return `${interpolate(block.label, variables).trim()}: ${href}`;
    }
    case "DIVIDER":
      return "---";
    case "SPACER":
      return "";
    case "HTML":
      return interpolate(block.text, variables).trim();
  }
}

export function renderEmailTemplate(input: RenderEmailTemplateInput): EmailRenderedContent {
  assertEmailTemplateDocument(input.document);
  const variables = resolveVariables(input.document, input.values ?? {});
  const subject = interpolate(input.document.subject, variables).trim();
  const preheader = input.document.preheader
    ? interpolate(input.document.preheader, variables).trim()
    : undefined;

  const bodyHtml = input.document.blocks
    .map((block) => renderBlockHtml(block, variables))
    .join("");
  const hiddenPreheader = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>`
    : "";
  const html = `${hiddenPreheader}<div style="margin:0 auto;max-width:640px;padding:24px;background:#ffffff;">${bodyHtml}</div>`;
  const text = input.document.blocks
    .map((block) => renderBlockText(block, variables))
    .filter((part, index, parts) => part !== "" || (index > 0 && index < parts.length - 1))
    .join("\n\n")
    .trim();

  return {
    subject,
    ...(preheader ? { preheader } : {}),
    html,
    text,
    variables,
  };
}
