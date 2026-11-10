import { useSyncExternalStore } from "react";

/** Whether the Assist sheet is open. Shared by the top bar, the phone header and the sheet itself. */
let open = false;
const listeners = new Set<() => void>();

const set = (value: boolean): void => {
  if (open === value) return;
  open = value;
  listeners.forEach((listener) => listener());
};

export const openAssist = (): void => set(true);
export const closeAssist = (): void => set(false);

export function useAssistOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
    () => false,
  );
}
