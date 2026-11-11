import { Link } from "react-router";
import { ListChecks, Sun, SunDim, X } from "lucide-react";
import type { WakeStatus } from "@/hooks/use-wake-lock";
import type { TimerSummary } from "@/hooks/use-step-timers";
import { formatClock } from "@/lib/step-timers";

type Props = {
  title: string;
  wake: WakeStatus;
  timers: TimerSummary[];
  wide: boolean;
  onIngredients: () => void;
  onGoToStep: (step: number) => void;
};

const chip = "flex items-center gap-2 rounded-full bg-surface px-3.5 py-2 text-sm text-muted";

export function CookHeader({ title, wake, timers, wide, onIngredients, onGoToStep }: Props) {
  const first = timers[0];
  return (
    <header className="flex items-center gap-3 md:gap-4">
      <h1 className="min-w-0 truncate font-display text-[22px] font-bold md:text-3xl">{title}</h1>
      <span className={chip} role="status">
        {wake === "active" ? (
          <Sun size={16} className="shrink-0 text-offer" aria-hidden="true" />
        ) : (
          <SunDim size={16} className="shrink-0" aria-hidden="true" />
        )}
        <span className={wide ? "" : "sr-only"}>
          {wake === "active" ? "Skærmen holdes tændt" : wake === "pending" ? "Holder skærmen tændt …" : "Skærmen kan gå i dvale"}
        </span>
      </span>
      <div className="flex-1" />
      {first ? (
        <button
          type="button"
          onClick={() => onGoToStep(first.step)}
          aria-label={`Timer for trin ${first.step + 1}: ${first.status === "done" ? "færdig" : formatClock(first.remainingMs)}`}
          className={`flex h-11 items-center gap-2 rounded-full border-0 px-4 text-[15px] font-semibold tabular-nums ${
            first.status === "done" ? "bg-offer text-on-offer" : "bg-offer-soft text-offer"
          }`}
        >
          {first.status === "done" ? "Færdig!" : formatClock(first.remainingMs)}
          {timers.length > 1 ? <span className="text-xs opacity-80">+{timers.length - 1}</span> : null}
        </button>
      ) : null}
      {wide ? null : (
        <button
          type="button"
          onClick={onIngredients}
          aria-label="Vis ingredienser"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 bg-surface text-ink"
        >
          <ListChecks size={20} aria-hidden="true" />
        </button>
      )}
      <Link
        to="/uge"
        aria-label="Afslut kogetilstand"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink md:h-12 md:w-12"
      >
        <X size={22} aria-hidden="true" />
      </Link>
    </header>
  );
}
