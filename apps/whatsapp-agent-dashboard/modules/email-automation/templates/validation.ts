import type { EmailTemplateBlock, EmailTemplateDocument } from "./blocks";

const VARIABLE_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function tokenRegex(): RegExp {
  return /{{\s*([A-Za-z][A-Za-z0-9_.-]{0,63})\s*}}/g;
}

function textTokens(value: string): string[] {
  return [...value.matchAll(tokenRegex())].map((match) => match[1]);
}

function blockText(block: EmailTemplateBlock): readonly string[] {
  switch (block.type) {
    case "HEADING":
    case "TEXT":
      return [block.text];
    case "IMAGE":
      return [block.src, block.alt, block.linkUrl ?? ""];
    case "BUTTON":
      return [block.label, block.url];
    case "HTML":
      return [block.html, block.text];
    case "DIVIDER":
    case "SPACER":
      return [];
  }
}

function hasTemplateToken(value: string): boolean {
  return tokenRegex().test(value);
}

export function assertSafeEmailUrl(value: string, purpose: "LINK" | "IMAGE"): void {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${purpose.toLowerCase()} URL is required.`);

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${purpose.toLowerCase()} URL is invalid.`);
  }

  const allowed =
    purpose === "IMAGE"
      ? new Set(["https:", "cid:"])
      : new Set(["https:", "http:", "mailto:", "tel:"]);
  if (!allowed.has(parsed.protocol)) {
    throw new Error(`${purpose.toLowerCase()} URL protocol ${parsed.protocol} is not allowed.`);
  }
}

function assertBlock(block: EmailTemplateBlock): void {
  if (!block.id.trim()) throw new Error("Email template block id is required.");

  switch (block.type) {
    case "HEADING":
      if (!block.text.trim()) throw new Error(`Heading block ${block.id} requires text.`);
      if (block.text.length > 500) throw new Error(`Heading block ${block.id} exceeds 500 characters.`);
      if (![1, 2, 3].includes(block.level)) throw new Error(`Heading block ${block.id} has an invalid level.`);
      return;
    case "TEXT":
      if (!block.text.trim()) throw new Error(`Text block ${block.id} requires text.`);
      if (block.text.length > 20_000) throw new Error(`Text block ${block.id} exceeds 20000 characters.`);
      return;
    case "IMAGE":
      if (!block.alt.trim()) throw new Error(`Image block ${block.id} requires alt text.`);
      if (block.width !== undefined && (!Number.isInteger(block.width) || block.width < 64 || block.width > 640)) {
        throw new Error(`Image block ${block.id} width must be an integer between 64 and 640.`);
      }
      if (!hasTemplateToken(block.src)) assertSafeEmailUrl(block.src, "IMAGE");
      if (block.linkUrl && !hasTemplateToken(block.linkUrl)) assertSafeEmailUrl(block.linkUrl, "LINK");
      return;
    case "BUTTON":
      if (!block.label.trim()) throw new Error(`Button block ${block.id} requires a label.`);
      if (block.label.length > 120) throw new Error(`Button block ${block.id} label exceeds 120 characters.`);
      if (!hasTemplateToken(block.url)) assertSafeEmailUrl(block.url, "LINK");
      return;
    case "DIVIDER":
      if (block.color !== undefined && !HEX_COLOR.test(block.color)) {
        throw new Error(`Divider block ${block.id} color must be a six-digit hex color.`);
      }
      if (block.thickness !== undefined && (!Number.isInteger(block.thickness) || block.thickness < 1 || block.thickness > 8)) {
        throw new Error(`Divider block ${block.id} thickness must be an integer between 1 and 8.`);
      }
      return;
    case "SPACER":
      if (!Number.isInteger(block.height) || block.height < 0 || block.height > 120) {
        throw new Error(`Spacer block ${block.id} height must be an integer between 0 and 120.`);
      }
      return;
    case "HTML":
      if (!block.html.trim()) throw new Error(`HTML block ${block.id} requires HTML.`);
      if (block.html.length > 200_000) throw new Error(`HTML block ${block.id} exceeds 200000 characters.`);
      if (block.text.length > 100_000) throw new Error(`HTML block ${block.id} plain text exceeds 100000 characters.`);
      if (/<\s*(script|iframe|object|embed|form|meta|base)\b/iu.test(block.html) || /\son[a-z]+\s*=/iu.test(block.html) || /javascript\s*:/iu.test(block.html)) throw new Error(`HTML block ${block.id} contains unsafe HTML.`);
      return;
  }
}

export function assertEmailTemplateDocument(document: EmailTemplateDocument): void {
  const subject = document.subject.trim();
  if (!subject) throw new Error("Email template subject is required.");
  if (document.subject.length > 200) throw new Error("Email template subject exceeds 200 characters.");
  if ((document.preheader?.length ?? 0) > 200) throw new Error("Email template preheader exceeds 200 characters.");
  if (document.blocks.length === 0) throw new Error("Email template requires at least one content block.");
  if (document.blocks.length > 100) throw new Error("Email template cannot exceed 100 content blocks.");

  const blockIds = new Set<string>();
  for (const block of document.blocks) {
    assertBlock(block);
    if (blockIds.has(block.id)) throw new Error(`Duplicate email template block id: ${block.id}.`);
    blockIds.add(block.id);
  }

  const variableKeys = new Set<string>();
  for (const variable of document.variables) {
    if (!VARIABLE_KEY.test(variable.key)) throw new Error(`Invalid email template variable key: ${variable.key}.`);
    if (variableKeys.has(variable.key)) throw new Error(`Duplicate email template variable key: ${variable.key}.`);
    variableKeys.add(variable.key);
  }

  const tokenSources = [
    document.subject,
    document.preheader ?? "",
    ...document.blocks.flatMap(blockText),
  ];
  for (const source of tokenSources) {
    for (const token of textTokens(source)) {
      if (!variableKeys.has(token)) throw new Error(`Email template token {{${token}}} is not declared.`);
    }
  }
}
