"use client";

import { useEffect } from "react";

const RECOVERY_KEY = "sd_chunk_recovery_once";

function isChunkFailure(value: unknown): boolean {
  const text = value instanceof Error ? `${value.name} ${value.message}` : String(value ?? "");
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text);
}

function recoverOnce() {
  try {
    if (sessionStorage.getItem(RECOVERY_KEY) === "1") return;
    sessionStorage.setItem(RECOVERY_KEY, "1");
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }

  window.location.reload();
}

export default function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isChunkFailure(event.error ?? event.message)) recoverOnce();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkFailure(event.reason)) recoverOnce();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
