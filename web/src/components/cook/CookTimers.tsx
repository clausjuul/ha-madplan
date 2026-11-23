import { useEffect } from "react";
import { Timer, X } from "lucide-react";
import { useRoute } from "@/hooks/use-route";
import { useNow } from "@/hooks/use-step-timers";
import { alertTimerDone } from "@/lib/beep";
import { activeTimers, clearCookTimer, setCookStep, tickCookTimers, useCookSessions } from "@/lib/cook-session";
import { notify } from "@/lib/notify";
import { formatClock } from "@/lib/step-timers";
import { remainingMs } from "@/lib/timer-machine";

/** Watches every cooking timer from the app shell, so one that finishes beeps on any screen. */
export function CookTimersHost() {
  const { route, navigate } = useRoute();
  const sessions = useCookSessions();
  const running = activeTimers(sessions).some((entry) => entry.timer.status === "running");
  const now = useNow(running);

  useEffect(() => {
    const finished = tickCookTimers(now);
    const first = finished[0];
    if (!first) return;
    alertTimerDone();
    const here = route.name === "lav-mad" && route.dishId === first.dishId;
    notify(`Timeren for trin ${first.step + 1} i ${first.dishName} er færdig.`, 10_000, {
      label: "Gå til trin",
      run: () => {
        setCookStep(first.dishId, first.dishName, first.step);
        if (!here) navigate({ name: "lav-mad", dishId: first.dishId });
      },
    });
  }, [now, route, navigate]);

  return null;
}

/** Outside cooking mode: a strip that shows a running timer and leads back to the dish. */
export function CookTimerBanner() {
  const { navigate } = useRoute();
  const sessions = useCookSessions();
  const timers = activeTimers(sessions);
  const now = useNow(timers.some((entry) => entry.timer.status === "running"));
  const first = [...timers].sort((a, b) => remainingMs(a.timer, now) - remainingMs(b.timer, now))[0];
  if (!first) return null;
  const done = first.timer.status === "done";
  const open = (): void => {
    setCookStep(first.dishId, first.dishName, first.step);
    navigate({ name: "lav-mad", dishId: first.dishId });
  };
  return (
    <div role="status" className={`flex shrink-0 items-center gap-1 px-2 ${done ? "bg-offer text-on-offer" : "bg-offer-soft text-offer"}`}>
      <button type="button" onClick={open} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm font-semibold">
        <Timer size={16} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">
          {first.dishName} · trin {first.step + 1}
        </span>
        <span className="shrink-0 tabular-nums">{done ? "Færdig!" : formatClock(remainingMs(first.timer, now))}</span>
        {timers.length > 1 ? <span className="shrink-0 text-xs opacity-80">+{timers.length - 1}</span> : null}
        <span className="ml-auto shrink-0 font-medium underline">Til kogetilstand</span>
      </button>
      {done ? (
        <button
          type="button"
          aria-label="Luk timeren"
          onClick={() => clearCookTimer(first.dishId, first.step)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        >
          <X size={18} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
