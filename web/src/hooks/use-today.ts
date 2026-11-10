import { useSyncExternalStore } from "react";
import { dateKey, msUntilNextMidnight } from "@madplan/domain";

/** Re-checks a moment after local midnight, and whenever the tab becomes visible again. */
function subscribe(notify: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      notify();
      schedule();
    }, msUntilNextMidnight(new Date()) + 250);
  };
  const onVisible = (): void => {
    if (document.visibilityState !== "visible") return;
    notify();
    schedule();
  };
  schedule();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}

const snapshot = (): string => dateKey(new Date());

/** Today's local date key (YYYY-MM-DD); re-renders at midnight. Use this for everything "today". */
export function useToday(): string {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
