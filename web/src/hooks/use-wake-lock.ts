import { useEffect, useState } from "react";

export type WakeStatus = "pending" | "active" | "unavailable";

/**
 * Keeps the screen on while mounted (Screen Wake Lock). The browser drops the lock when the tab is hidden,
 * so it is re-acquired when the page becomes visible again. Without support (or on plain http) the status is
 * "unavailable" so the UI can say so honestly.
 */
export function useWakeLock(): WakeStatus {
  const [status, setStatus] = useState<WakeStatus>("pending");

  useEffect(() => {
    let sentinel: WakeLockSentinel | undefined;
    let cancelled = false;

    const acquire = async (): Promise<void> => {
      if (!("wakeLock" in navigator)) {
        setStatus("unavailable");
        return;
      }
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
        setStatus("active");
        lock.addEventListener("release", () => {
          if (!cancelled) setStatus("pending");
        });
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    };

    const onVisibility = (): void => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  return status;
}
