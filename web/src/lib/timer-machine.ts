/** Pure state machine for a step timer. Time is passed in, so it is trivially testable. */
export type TimerStatus = "idle" | "running" | "paused" | "done";

export type TimerState = {
  status: TimerStatus;
  durationMs: number;
  /** Remaining time while not running. */
  remainingMs: number;
  /** Absolute end time (ms epoch) while running. */
  endsAt?: number;
};

export const createTimer = (durationMs: number): TimerState => ({
  status: "idle",
  durationMs,
  remainingMs: durationMs,
});

export function remainingMs(timer: TimerState, now: number): number {
  return timer.status === "running" && timer.endsAt !== undefined
    ? Math.max(0, timer.endsAt - now)
    : timer.remainingMs;
}

/** Starts an idle timer, resumes a paused one, and restarts a finished one. */
export function startTimer(timer: TimerState, now: number): TimerState {
  if (timer.status === "running") return timer;
  const remaining = timer.status === "done" ? timer.durationMs : timer.remainingMs;
  return { ...timer, status: "running", remainingMs: remaining, endsAt: now + remaining };
}

export function pauseTimer(timer: TimerState, now: number): TimerState {
  if (timer.status !== "running") return timer;
  return { status: "paused", durationMs: timer.durationMs, remainingMs: remainingMs(timer, now) };
}

export const resetTimer = (timer: TimerState): TimerState => createTimer(timer.durationMs);

/** Moves a running timer to "done" once its end time has passed; otherwise returns the same object. */
export function tickTimer(timer: TimerState, now: number): TimerState {
  if (timer.status !== "running" || timer.endsAt === undefined || now < timer.endsAt) return timer;
  return { status: "done", durationMs: timer.durationMs, remainingMs: 0 };
}
