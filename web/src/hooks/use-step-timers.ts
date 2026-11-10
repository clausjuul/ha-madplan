import { useCallback, useEffect, useMemo, useState } from "react";
import { alertTimerDone, primeAudio } from "@/lib/beep";
import { notify } from "@/lib/notify";
import {
  createTimer,
  pauseTimer,
  remainingMs,
  resetTimer,
  startTimer,
  tickTimer,
  type TimerState,
} from "@/lib/timer-machine";

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

/** One timer per step; they keep running while you move between steps. Beeps + vibrates when one finishes. */
export function useStepTimers(): StepTimers {
  const [timers, setTimers] = useState<Record<number, TimerState>>({});
  const [now, setNow] = useState(() => Date.now());
  const anyRunning = Object.values(timers).some((timer) => timer.status === "running");

  useEffect(() => {
    if (!anyRunning) return;
    const refresh = (): void => setNow(Date.now());
    const id = setInterval(refresh, 250);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [anyRunning]);

  useEffect(() => {
    const next: Record<number, TimerState> = { ...timers };
    let finished = 0;
    for (const [key, timer] of Object.entries(timers)) {
      const ticked = tickTimer(timer, now);
      if (ticked !== timer) {
        next[Number(key)] = ticked;
        finished += 1;
      }
    }
    if (finished === 0) return;
    setTimers(next);
    alertTimerDone();
    notify("Timeren er færdig.", 8000);
  }, [now, timers]);

  const update = useCallback((step: number, change: (timer: TimerState, at: number) => TimerState, seconds = 0) => {
    const at = Date.now();
    setTimers((current) => ({ ...current, [step]: change(current[step] ?? createTimer(seconds * 1000), at) }));
    setNow(at);
  }, []);

  const start = useCallback(
    (step: number, seconds: number) => {
      primeAudio();
      update(step, startTimer, seconds);
    },
    [update],
  );
  const pause = useCallback((step: number) => update(step, pauseTimer), [update]);
  const reset = useCallback((step: number) => update(step, (timer) => resetTimer(timer)), [update]);

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
