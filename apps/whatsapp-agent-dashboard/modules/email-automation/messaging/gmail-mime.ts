import type { EmailAddress, EmailSendRequest } from "../domain/contracts";

function safeHeader(value: string): string {
  if (/\r|\n/.test(value)) throw new Error("Email header contains an invalid newline.");
  return value.trim();
}

function encodedWord(value: string): string {
  const clean = safeHeader(value);
  return /[^\x20-\x7E]/.test(clean)
    ? `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`
    : clean;
}

function address(value: EmailAddress): string {
  const email = safeHeader(value.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Invalid email address: ${email}.`);
  return value.name?.trim() ? `${encodedWord(value.name)} <${email}>` : email;
}

function lines(value: string): string { return value.replace(/\r?\n/g, "\r\n"); }
function boundary(prefix: string, key: string): string { return `${prefix}-${Buffer.from(key).toString("hex").slice(0,24)}`; }

function oneClickUnsubscribeHeaders(request: EmailSendRequest): string[] {
  const raw = request.rendered.variables.unsubscribe_url?.trim();
  if (!raw) return [];
  const value = safeHeader(raw);
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("Marketing unsubscribe URL is invalid."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Marketing unsubscribe URL must use HTTP(S).");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Marketing unsubscribe URL must use HTTPS in production.");
  return [
    `List-Unsubscribe: <${value}>`,
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
  ];
}

export function buildGmailMime(request: EmailSendRequest, from: EmailAddress): string {
  const mixed = boundary("mixed", request.idempotencyKey);
  const alt = boundary("alt", request.idempotencyKey);
  const headers = [
    `From: ${address(from)}`,
    `To: ${request.to.map(address).join(", ")}`,
    ...(request.cc?.length ? [`Cc: ${request.cc.map(address).join(", ")}`] : []),
    ...(request.bcc?.length ? [`Bcc: ${request.bcc.map(address).join(", ")}`] : []),
    ...(request.replyTo ? [`Reply-To: ${address(request.replyTo)}`] : []),
    ...oneClickUnsubscribeHeaders(request),
    `Subject: ${encodedWord(request.rendered.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
  ];
  const body = [
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`, "",
    `--${alt}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "",
    Buffer.from(lines(request.rendered.text), "utf8").toString("base64"),
    `--${alt}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "",
    Buffer.from(lines(request.rendered.html), "utf8").toString("base64"),
    `--${alt}--`,
  ];
  for (const item of request.attachments ?? []) {
    if (!item.contentBase64) throw new Error(`Attachment ${item.assetId} content is unavailable.`);
    body.push(`--${mixed}`, `Content-Type: ${safeHeader(item.mimeType)}; name="${safeHeader(item.fileName).replaceAll('"', '')}"`, "Content-Transfer-Encoding: base64");
    if (item.disposition === "INLINE") {
      if (!item.contentId) throw new Error(`Inline attachment ${item.assetId} is missing contentId.`);
      body.push(`Content-ID: <${safeHeader(item.contentId)}>`, `Content-Disposition: inline; filename="${safeHeader(item.fileName).replaceAll('"', '')}"`);
    } else body.push(`Content-Disposition: attachment; filename="${safeHeader(item.fileName).replaceAll('"', '')}"`);
    body.push("", item.contentBase64);
  }
  body.push(`--${mixed}--`, "");
  return [...headers, "", ...body].join("\r\n");
}

export function gmailRawBase64Url(mime: string): string {
  return Buffer.from(mime, "utf8").toString("base64url");
}
