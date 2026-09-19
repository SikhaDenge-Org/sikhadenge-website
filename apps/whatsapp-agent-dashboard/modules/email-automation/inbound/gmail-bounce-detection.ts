type GmailHeader = { name?: string; value?: string };

type GmailPayload = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayload[];
};

function header(headers: readonly GmailHeader[] | undefined, name: string): string {
  return headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value?.trim() || "";
}

function decodeBase64Url(value: string | undefined): string {
  if (!value) return "";
  try { return Buffer.from(value, "base64url").toString("utf8"); } catch { return ""; }
}

function collectDeliveryStatusText(payload: GmailPayload | undefined, out: string[] = []): string[] {
  if (!payload) return out;
  const mime = payload.mimeType?.toLowerCase() || "";
  if (mime === "message/delivery-status" || mime === "text/rfc822-headers") {
    const decoded = decodeBase64Url(payload.body?.data);
    if (decoded) out.push(decoded);
  }
  for (const child of payload.parts ?? []) collectDeliveryStatusText(child, out);
  return out;
}

function hasMimeType(payload: GmailPayload | undefined, expected: string): boolean {
  if (!payload) return false;
  if ((payload.mimeType || "").toLowerCase() === expected) return true;
  return (payload.parts ?? []).some((child) => hasMimeType(child, expected));
}

function normalizeEmail(value: string): string | null {
  const candidate = value.trim().replace(/^<|>$/g, "").toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(candidate) ? candidate : null;
}

function structuredRecipients(value: string): string[] {
  const out: string[] = [];
  const patterns = [
    /(?:Final-Recipient|Original-Recipient)\s*:\s*rfc822\s*;\s*([^\s<>;,]+@[^\s<>;,]+)/giu,
    /X-Failed-Recipients\s*:\s*([^\r\n]+)/giu,
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const raw = match[1] || "";
      for (const token of raw.split(",")) {
        const normalized = normalizeEmail(token);
        if (normalized) out.push(normalized);
      }
    }
  }
  return out;
}

function structuredStatusCodes(value: string): string[] {
  return [...value.matchAll(/^Status\s*:\s*([245]\.\d{1,3}\.\d{1,3})\s*$/gimu)]
    .map((match) => match[1]);
}

function classifyBounceStatus(codes: readonly string[]): { bounceClass: "HARD" | "SOFT" | "UNKNOWN"; statusCode: string | null } {
  const unique = [...new Set(codes)];
  const hard = unique.find((code) => code.startsWith("5."));
  if (hard) return { bounceClass: "HARD", statusCode: hard };
  const soft = unique.find((code) => code.startsWith("4."));
  if (soft) return { bounceClass: "SOFT", statusCode: soft };
  return { bounceClass: "UNKNOWN", statusCode: unique[0] ?? null };
}

export function detectGmailBounce(input: {
  headers?: readonly GmailHeader[];
  payload?: GmailPayload;
  from?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
  bodyHtml?: string;
}): { classification: "INBOUND" | "BOUNCE"; failedRecipient: string | null; signals: string[]; bounceClass: "HARD" | "SOFT" | "UNKNOWN" | null; statusCode: string | null } {
  const contentType = header(input.headers, "Content-Type").toLowerCase();
  const subject = (input.subject || "").trim();
  const from = (input.from || "").trim().toLowerCase();
  const signals: string[] = [];

  const deliveryStatusPart = hasMimeType(input.payload, "message/delivery-status");
  const multipartReport = (input.payload?.mimeType || "").toLowerCase() === "multipart/report" || contentType.includes("multipart/report");
  const deliveryStatusReport = contentType.includes("report-type=delivery-status");
  const daemonSender = /(?:^|[<\s])(mailer-daemon|postmaster)@/i.test(from);
  const failureSubject = /delivery status notification|delivery failure|undeliver|returned mail|failure notice/i.test(subject);

  if (deliveryStatusPart) signals.push("MESSAGE_DELIVERY_STATUS");
  if (multipartReport && deliveryStatusReport) signals.push("DELIVERY_STATUS_REPORT");
  if (daemonSender && failureSubject) signals.push("DAEMON_FAILURE_SUBJECT");

  const classification: "INBOUND" | "BOUNCE" = signals.length ? "BOUNCE" : "INBOUND";
  if (classification !== "BOUNCE") return { classification, failedRecipient: null, signals: [], bounceClass: null, statusCode: null };

  const failedHeader = header(input.headers, "X-Failed-Recipients");
  const evidence = [
    failedHeader ? `X-Failed-Recipients: ${failedHeader}` : "",
    ...collectDeliveryStatusText(input.payload),
    input.bodyText || "",
    input.bodyHtml || "",
    input.snippet || "",
  ].filter(Boolean).join("\n");

  const recipients = [...new Set(structuredRecipients(evidence))];
  const bounce = classifyBounceStatus(structuredStatusCodes(evidence));
  return {
    classification,
    failedRecipient: recipients.length === 1 ? recipients[0] : null,
    signals,
    bounceClass: bounce.bounceClass,
    statusCode: bounce.statusCode,
  };
}
