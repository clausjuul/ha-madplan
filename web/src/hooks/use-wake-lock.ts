import { useCallback, useEffect, useState } from "react";

export type WakeStatus = "pending" | "active" | "unavailable" | "off";

/**
 * Keeps the screen on while mounted and `enabled` (Screen Wake Lock). The browser drops the lock when the tab
 * is hidden, so it is re-acquired when the page becomes visible again. Without support (or on plain http) the
 * status is "unavailable" so the UI can say so honestly.
 */
export function useWakeLock(enabled = true): WakeStatus {
  const [status, setStatus] = useState<WakeStatus>(enabled ? "pending" : "off");

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      return;
    }
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

    setStatus("pending");
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled]);

  return status;
}

const KEEP_AWAKE_KEY = "madplan.shopping.keepAwake";

/** True when this browser can keep the screen on (Screen Wake Lock API; needs HTTPS). */
export const canKeepAwake = (): boolean =>
  typeof navigator !== "undefined" && "wakeLock" in navigator && (typeof window === "undefined" || window.isSecureContext);

function loadWanted(): boolean {
  try {
    return window.localStorage.getItem(KEEP_AWAKE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveWanted(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(KEEP_AWAKE_KEY, "1");
    else window.localStorage.removeItem(KEEP_AWAKE_KEY);
  } catch {
    // Private mode or blocked storage: the choice is just not remembered.
  }
}

export type KeepAwake = {
  /** The choice on this device (remembered between visits). */
  wanted: boolean;
  status: WakeStatus;
  supported: boolean;
  setWanted: (on: boolean) => void;
};

/** "Hold skærmen tændt" on the shopping list: opt-in, remembered per device, only while the view is open. */
export function useKeepAwake(): KeepAwake {
  const supported = canKeepAwake();
  const [wanted, setWantedState] = useState(() => supported && loadWanted());
  const status = useWakeLock(wanted);
  const setWanted = useCallback((on: boolean) => {
    saveWanted(on);
    setWantedState(on);
  }, []);
  return { wanted, status, supported, setWanted };
}
