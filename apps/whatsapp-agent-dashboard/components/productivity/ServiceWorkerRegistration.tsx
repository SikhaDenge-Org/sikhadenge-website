"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (!cancelled) void registration.update().catch(() => undefined);
      } catch (error) {
        console.warn("[pwa] service worker registration failed", error);
      }
    };
    void register();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
