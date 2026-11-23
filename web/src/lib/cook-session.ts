import { useSyncExternalStore } from "react";
import { createTimer, tickTimer, type TimerState } from "./timer-machine";

/**
 * Cooking mode's step and timers, kept outside the cook screen so they survive leaving it
 * (to check the shopping list) and a reload. One session per dish; timers keep their absolute
 * end time, so a reload simply picks up where the clock is.
 */
export type CookSession = {
  dishId: string;
  dishName: string;
  step: number;
  timers: Record<number, TimerState>;
};

type Sessions = Record<string, CookSession>;

const KEY = "madplan:cook";
const listeners = new Set<() => void>();

function load(): Sessions {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Sessions) : {};
  } catch {
    return {};
  }
}

let sessions: Sessions = load();

function save(next: Sessions): void {
  sessions = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage is a convenience: the session still lives in memory.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const cookSessions = (): Sessions => sessions;

export function useCookSessions(): Sessions {
  return useSyncExternalStore(subscribe, cookSessions, cookSessions);
}

const sessionFor = (dishId: string, dishName: string): CookSession =>
  sessions[dishId] ?? { dishId, dishName, step: 0, timers: {} };

export function setCookStep(dishId: string, dishName: string, step: number): void {
  const session = sessionFor(dishId, dishName);
  if (session.step === step && sessions[dishId]) return;
  save({ ...sessions, [dishId]: { ...session, dishName, step } });
}

export function updateCookTimer(
  dishId: string,
  dishName: string,
  step: number,
  change: (timer: TimerState, at: number) => TimerState,
  seconds = 0,
): void {
  const session = sessionFor(dishId, dishName);
  const timer = session.timers[step] ?? createTimer(seconds * 1000);
  save({ ...sessions, [dishId]: { ...session, dishName, timers: { ...session.timers, [step]: change(timer, Date.now()) } } });
}

/** "Færdig – velbekomme": forgets the step, but a timer that is still running keeps going. */
export function finishCooking(dishId: string): void {
  const session = sessions[dishId];
  if (!session) return;
  const running = Object.fromEntries(Object.entries(session.timers).filter(([, timer]) => timer.status === "running"));
  const next = { ...sessions };
  if (Object.keys(running).length > 0) next[dishId] = { ...session, step: 0, timers: running };
  else delete next[dishId];
  save(next);
}

/** Dismisses a finished timer (the banner's close button). */
export function clearCookTimer(dishId: string, step: number): void {
  const session = sessions[dishId];
  if (!session?.timers[step]) return;
  const timers = { ...session.timers };
  delete timers[step];
  save({ ...sessions, [dishId]: { ...session, timers } });
}

export type FinishedTimer = { dishId: string; dishName: string; step: number };

/** Moves timers whose time is up to "done" and returns them, so the caller can beep once per timer. */
export function tickCookTimers(now: number): FinishedTimer[] {
  const finished: FinishedTimer[] = [];
  let changed = false;
  const next: Sessions = {};
  for (const [dishId, session] of Object.entries(sessions)) {
    const timers: Record<number, TimerState> = {};
    for (const [key, timer] of Object.entries(session.timers)) {
      const ticked = tickTimer(timer, now);
      if (ticked !== timer) {
        changed = true;
        finished.push({ dishId, dishName: session.dishName, step: Number(key) });
      }
      timers[Number(key)] = ticked;
    }
    next[dishId] = { ...session, timers };
  }
  if (changed) save(next);
  return finished;
}

export type ActiveTimer = { dishId: string; dishName: string; step: number; timer: TimerState };

/** Running and finished timers across all dishes. */
export function activeTimers(all: Sessions): ActiveTimer[] {
  return Object.values(all).flatMap((session) =>
    Object.entries(session.timers)
      .filter(([, timer]) => timer.status === "running" || timer.status === "done")
      .map(([key, timer]) => ({ dishId: session.dishId, dishName: session.dishName, step: Number(key), timer })),
  );
}

/** For tests. */
export function resetCookSessions(): void {
  save({});
}
