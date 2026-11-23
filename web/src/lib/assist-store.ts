import { useSyncExternalStore } from "react";

/** Whether the Assist sheet is open, and which day it was opened about. Shared by the headers, the day menu and the sheet. */
let open = false;
let focusDate: string | undefined;
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Opens Assist; with a date ("Spørg Assist om dagen") the questions are about that day. */
export const openAssist = (options?: { date?: string }): void => {
  open = true;
  focusDate = options?.date;
  emit();
};
export const closeAssist = (): void => {
  if (!open) return;
  open = false;
  focusDate = undefined;
  emit();
};

export function useAssistOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}

export function useAssistFocusDate(): string | undefined {
  return useSyncExternalStore(subscribe, () => focusDate, () => undefined);
}
