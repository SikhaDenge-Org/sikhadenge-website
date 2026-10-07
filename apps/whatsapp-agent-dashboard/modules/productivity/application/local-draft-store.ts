import {
  decideDraftRecovery,
  type CounselorDraft,
} from "../domain/draft-recovery";

export type DraftStorage = {
  getItem(key: string): string | null;
  setItem(
    key: string,
    value: string,
  ): void;
  removeItem(key: string): void;
};

type SerializedDraft = {
  conversationId: string;
  body: string;
  revision: number;
  savedAt: string;
  deviceId: string;
};

const DRAFT_STORAGE_PREFIX =
  "sikhadenge:engageos:draft:v1:";

const DEVICE_STORAGE_KEY =
  "sikhadenge:engageos:device:v1";

const MAX_DRAFT_AGE_MS =
  7 * 24 * 60 * 60 * 1000;

export function draftStorageKey(
  conversationId: string,
): string {
  return (
    DRAFT_STORAGE_PREFIX +
    encodeURIComponent(
      conversationId,
    )
  );
}

function createDeviceId(): string {
  return [
    "browser",
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2, 12),
  ].join("-");
}

export function getOrCreateDraftDeviceId(
  storage: DraftStorage,
): string {
  try {
    const existing =
      storage.getItem(
        DEVICE_STORAGE_KEY,
      );

    if (
      existing &&
      existing.length >= 8
    ) {
      return existing;
    }

    const next =
      createDeviceId();

    storage.setItem(
      DEVICE_STORAGE_KEY,
      next,
    );

    return next;
  } catch {
    return createDeviceId();
  }
}

export function persistLocalDraft(
  storage: DraftStorage,
  draft: CounselorDraft,
): boolean {
  try {
    if (
      draft.body.length === 0
    ) {
      storage.removeItem(
        draftStorageKey(
          draft.conversationId,
        ),
      );

      return true;
    }

    const serialized:
      SerializedDraft = {
        conversationId:
          draft.conversationId,
        body: draft.body,
        revision:
          draft.revision,
        savedAt:
          draft.savedAt.toISOString(),
        deviceId:
          draft.deviceId,
      };

    storage.setItem(
      draftStorageKey(
        draft.conversationId,
      ),
      JSON.stringify(
        serialized,
      ),
    );

    return true;
  } catch {
    return false;
  }
}

export function clearLocalDraft(
  storage: DraftStorage,
  conversationId: string,
): void {
  try {
    storage.removeItem(
      draftStorageKey(
        conversationId,
      ),
    );
  } catch {
    // Draft persistence must never block the Inbox.
  }
}

export function restoreLocalDraft(
  storage: DraftStorage,
  conversationId: string,
  nowMs = Date.now(),
): CounselorDraft | undefined {
  const key =
    draftStorageKey(
      conversationId,
    );

  try {
    const raw =
      storage.getItem(key);

    if (!raw) {
      return undefined;
    }

    const parsed =
      JSON.parse(
        raw,
      ) as Partial<SerializedDraft>;

    const savedAt =
      typeof parsed.savedAt ===
      "string"
        ? new Date(
            parsed.savedAt,
          )
        : null;

    const valid =
      parsed.conversationId ===
        conversationId &&
      typeof parsed.body ===
        "string" &&
      Number.isInteger(
        parsed.revision,
      ) &&
      Number(
        parsed.revision,
      ) >= 0 &&
      savedAt !== null &&
      Number.isFinite(
        savedAt.getTime(),
      ) &&
      typeof parsed.deviceId ===
        "string" &&
      parsed.deviceId.length >= 8;

    if (!valid || !savedAt) {
      storage.removeItem(
        key,
      );

      return undefined;
    }

    if (
      nowMs -
        savedAt.getTime() >
      MAX_DRAFT_AGE_MS
    ) {
      storage.removeItem(
        key,
      );

      return undefined;
    }

    const local:
      CounselorDraft = {
        conversationId,
        body:
          parsed.body as string,
        revision:
          parsed.revision as number,
        savedAt,
        deviceId:
          parsed.deviceId as string,
      };

    const decision =
      decideDraftRecovery({
        local,
      });

    if (
      decision.action ===
      "RESTORE_LOCAL"
    ) {
      return decision.draft;
    }

    return undefined;
  } catch {
    try {
      storage.removeItem(
        key,
      );
    } catch {
      // Ignore unavailable browser storage.
    }

    return undefined;
  }
}
