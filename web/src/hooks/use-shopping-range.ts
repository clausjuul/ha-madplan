import { useCallback, useMemo, useState } from "react";
import type { ShoppingQuery } from "@madplan/domain";
import { usableEnd } from "@/lib/shopping-view";

const STORAGE_KEY = "madplan.shopping.to";

function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(value: string | undefined): void {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, value);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is a convenience only.
  }
}

/** The chosen end date of the shopping list, remembered per device. Undefined = the server default. */
export function useShoppingRange(today: string): {
  query: ShoppingQuery | undefined;
  setEnd: (to: string | undefined) => void;
} {
  const [stored, setStored] = useState<string | null>(read);
  const to = usableEnd(stored, today);
  const query = useMemo<ShoppingQuery | undefined>(() => (to ? { from: today, to } : undefined), [today, to]);
  const setEnd = useCallback((value: string | undefined) => {
    write(value);
    setStored(value ?? null);
  }, []);
  return { query, setEnd };
}
