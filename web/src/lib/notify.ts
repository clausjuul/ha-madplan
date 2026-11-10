import { useSyncExternalStore } from "react";

export type NoticeAction = { label: string; run: () => void };
export type Notice = { id: number; message: string; action?: NoticeAction };

let current: Notice | null = null;
let counter = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

const emit = (): void => listeners.forEach((listener) => listener());

/** Shows a short, gentle message (toast). Replaces any message already showing. */
export function notify(message: string, durationMs = 4200, action?: NoticeAction): void {
  counter += 1;
  current = { id: counter, message, ...(action ? { action } : {}) };
  clearTimeout(timer);
  timer = setTimeout(dismissNotice, durationMs);
  emit();
}

export function dismissNotice(): void {
  clearTimeout(timer);
  current = null;
  emit();
}

export function useNotice(): Notice | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}
