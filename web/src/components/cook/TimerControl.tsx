import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import type { DetectedTimer } from "@/lib/step-timers";
import { formatClock } from "@/lib/step-timers";
import { remainingMs, type TimerState } from "@/lib/timer-machine";

type Props = {
  detected: DetectedTimer;
  timer: TimerState | undefined;
  now: number;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
};

const pill =
  "flex h-[60px] items-center gap-3 rounded-full border-0 bg-offer-soft px-5 text-lg font-semibold text-offer";
const round = "flex h-[60px] w-[60px] items-center justify-center rounded-full border-0 bg-raised text-ink";

/** Start / pause / reset for the timer detected in the current step. */
export function TimerControl({ detected, timer, now, onStart, onPause, onReset }: Props) {
  const status = timer?.status ?? "idle";
  if (status === "idle") {
    return (
      <button type="button" onClick={onStart} className={`${pill} self-start pl-5 pr-6`}>
        <Timer size={22} aria-hidden="true" />
        Start timer · {detected.label}
      </button>
    );
  }
  const left = timer ? remainingMs(timer, now) : 0;
  return (
    <div className="flex flex-wrap items-center gap-3 self-start" role="timer" aria-label="Timer">
      <span
        className={`flex h-[60px] items-center gap-3 rounded-full px-6 font-display text-[28px] font-bold tabular-nums ${
          status === "done" ? "bg-offer text-on-offer" : "bg-offer-soft text-offer"
        }`}
      >
        <Timer size={22} aria-hidden="true" />
        {status === "done" ? "Færdig!" : formatClock(left)}
      </span>
      {status === "running" ? (
        <button type="button" onClick={onPause} aria-label="Sæt timeren på pause" className={round}>
          <Pause size={22} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onStart}
          aria-label={status === "done" ? "Start timeren igen" : "Fortsæt timeren"}
          className={round}
        >
          <Play size={22} aria-hidden="true" />
        </button>
      )}
      <button type="button" onClick={onReset} aria-label="Nulstil timeren" className={round}>
        <RotateCcw size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
