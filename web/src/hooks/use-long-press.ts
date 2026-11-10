import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

/** Fires `onLongPress` after `delayMs` of holding still; moving more than `slop` px cancels. */
export function useLongPress(onLongPress: () => void, delayMs = 550, slop = 8) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    origin.current = null;
  }, []);

  return {
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      origin.current = { x: event.clientX, y: event.clientY };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        origin.current = null;
        onLongPress();
      }, delayMs);
    },
    onPointerMove: (event: ReactPointerEvent) => {
      const start = origin.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > slop) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  };
}
