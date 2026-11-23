import { useCallback, useEffect, useMemo, useState } from "react";
import { primeAudio } from "@/lib/beep";
import { updateCookTimer, useCookSessions } from "@/lib/cook-session";
import { pauseTimer, remainingMs, resetTimer, startTimer, type TimerState } from "@/lib/timer-machine";

export type TimerSummary = { step: number; status: TimerState["status"]; remainingMs: number };

export type StepTimers = {
  timers: Record<number, TimerState>;
  now: number;
  start: (step: number, seconds: number) => void;
  pause: (step: number) => void;
  reset: (step: number) => void;
  /** Running and finished timers, soonest first – shown in the header whatever step you are on. */
  active: TimerSummary[];
};

/** A clock that ticks while `running`, for showing time left. */
export function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const refresh = (): void => setNow(Date.now());
    refresh();
    const id = setInterval(refresh, 250);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [running]);
  return now;
}

/**
 * One timer per step of a dish. They live in the cook session store, so they keep running when you
 * leave cooking mode; `CookTimersHost` beeps when one finishes, wherever you are in the app.
 */
export function useStepTimers(dishId: string, dishName: string): StepTimers {
  const sessions = useCookSessions();
  const timers = useMemo(() => sessions[dishId]?.timers ?? {}, [sessions, dishId]);
  const anyRunning = Object.values(timers).some((timer) => timer.status === "running");
  const now = useNow(anyRunning);

  const start = useCallback(
    (step: number, seconds: number) => {
      primeAudio();
      updateCookTimer(dishId, dishName, step, startTimer, seconds);
    },
    [dishId, dishName],
  );
  const pause = useCallback((step: number) => updateCookTimer(dishId, dishName, step, pauseTimer), [dishId, dishName]);
  const reset = useCallback((step: number) => updateCookTimer(dishId, dishName, step, (timer) => resetTimer(timer)), [dishId, dishName]);

  const active = useMemo<TimerSummary[]>(
    () =>
      Object.entries(timers)
        .filter(([, timer]) => timer.status === "running" || timer.status === "done")
        .map(([key, timer]) => ({ step: Number(key), status: timer.status, remainingMs: remainingMs(timer, now) }))
        .sort((a, b) => a.remainingMs - b.remainingMs),
    [timers, now],
  );

  return { timers, now, start, pause, reset, active };
}
