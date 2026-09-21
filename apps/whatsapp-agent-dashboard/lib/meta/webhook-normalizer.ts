type JsonRecord = Record<string, unknown>;

export type NormalizedInboundMessage = {
  kind: "message";
  eventKey: string;
  waId: string;
  profileName: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  message: {
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text: string | null;
    mediaId: string | null;
    mimeType: string | null;
    filename: string | null;
    raw: JsonRecord;
  };
};

export type NormalizedMessageStatus = {
  kind: "status";
  eventKey: string;
  phoneNumberId: string | null;
  status: {
    messageId: string;
    recipientId: string | null;
    value: string;
    timestamp: string;
    errorCode: string | null;
    errorMessage: string | null;
    raw: JsonRecord;
  };
};

export type NormalizedWhatsAppEvent =
  | NormalizedInboundMessage
  | NormalizedMessageStatus;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textFromMessage(message: JsonRecord, type: string): string | null {
  if (type === "text") {
    return asString(asRecord(message.text)?.body);
  }

  if (type === "interactive") {
    const interactive = asRecord(message.interactive);
    return (
      asString(asRecord(interactive?.button_reply)?.title) ||
      asString(asRecord(interactive?.list_reply)?.title) ||
      asString(interactive?.type)
    );
  }

  if (type === "location") {
    const location = asRecord(message.location);
    const name = asString(location?.name);
    const address = asString(location?.address);
    const latitude = location?.latitude;
    const longitude = location?.longitude;
    if (name || address) return [name, address].filter(Boolean).join(" — ");
    if (typeof latitude === "number" && typeof longitude === "number") {
      return `${latitude}, ${longitude}`;
    }
    return null;
  }

  if (type === "reaction") {
    return asString(asRecord(message.reaction)?.emoji);
  }

  const typedPayload = asRecord(message[type]);
  return asString(typedPayload?.caption);
}

function mediaFromMessage(message: JsonRecord, type: string): {
  mediaId: string | null;
  mimeType: string | null;
  filename: string | null;
} {
  if (!["image", "video", "audio", "document", "sticker"].includes(type)) {
    return { mediaId: null, mimeType: null, filename: null };
  }

  const media = asRecord(message[type]);
  return {
    mediaId: asString(media?.id),
    mimeType: asString(media?.mime_type),
    filename: asString(media?.filename),
  };
}

function contactNames(value: JsonRecord): Map<string, string> {
  const names = new Map<string, string>();
  for (const item of asArray(value.contacts)) {
    const contact = asRecord(item);
    const waId = asString(contact?.wa_id);
    const name = asString(asRecord(contact?.profile)?.name);
    if (waId && name) names.set(waId, name);
  }
  return names;
}

function firstStatusError(status: JsonRecord): {
  code: string | null;
  message: string | null;
} {
  const error = asRecord(asArray(status.errors)[0]);
  const codeValue = error?.code;
  const code =
    typeof codeValue === "number" || typeof codeValue === "string"
      ? String(codeValue)
      : null;
  return {
    code,
    message:
      asString(error?.message) ||
      asString(error?.title) ||
      asString(asRecord(error?.error_data)?.details),
  };
}

export function normalizeWhatsAppWebhook(payload: unknown): NormalizedWhatsAppEvent[] {
  const root = asRecord(payload);
  if (!root || root.object !== "whatsapp_business_account") return [];

  const events: NormalizedWhatsAppEvent[] = [];

  for (const entryValue of asArray(root.entry)) {
    const entry = asRecord(entryValue);
    for (const changeValue of asArray(entry?.changes)) {
      const change = asRecord(changeValue);
      if (asString(change?.field) !== "messages") continue;

      const value = asRecord(change?.value);
      if (!value) continue;

      const metadata = asRecord(value.metadata);
      const phoneNumberId = asString(metadata?.phone_number_id);
      const displayPhoneNumber = asString(metadata?.display_phone_number);
      const names = contactNames(value);

      for (const messageValue of asArray(value.messages)) {
        const message = asRecord(messageValue);
        if (!message) continue;

        const id = asString(message.id);
        const from = asString(message.from);
        const timestamp = asString(message.timestamp) || String(Math.floor(Date.now() / 1000));
        if (!id || !from) continue;

        const type = asString(message.type)?.toLowerCase() || "unsupported";
        const media = mediaFromMessage(message, type);
        events.push({
          kind: "message",
          eventKey: `message:${id}`,
          waId: from,
          profileName: names.get(from) || null,
          phoneNumberId,
          displayPhoneNumber,
          message: {
            id,
            from,
            timestamp,
            type,
            text: textFromMessage(message, type),
            ...media,
            raw: message,
          },
        });
      }

      for (const statusValue of asArray(value.statuses)) {
        const status = asRecord(statusValue);
        if (!status) continue;

        const messageId = asString(status.id);
        const statusValueText = asString(status.status)?.toLowerCase();
        const timestamp = asString(status.timestamp) || String(Math.floor(Date.now() / 1000));
        if (!messageId || !statusValueText) continue;

        const error = firstStatusError(status);
        events.push({
          kind: "status",
          eventKey: `status:${messageId}:${statusValueText}:${timestamp}`,
          phoneNumberId,
          status: {
            messageId,
            recipientId: asString(status.recipient_id),
            value: statusValueText,
            timestamp,
            errorCode: error.code,
            errorMessage: error.message,
            raw: status,
          },
        });
      }
    }
  }

  return events;
}
