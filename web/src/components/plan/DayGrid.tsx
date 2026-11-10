import { Lock, RefreshCw } from "lucide-react";
import { parseDateKey, weekdayName, type Dish, type MealMap } from "@madplan/domain";
import { dateStatus, type DateStatus } from "@/lib/plan-form";

type Props = {
  dates: readonly string[];
  /** Dates the plan covers. */
  planned: ReadonlySet<string>;
  skipped: ReadonlySet<string>;
  meals: MealMap;
  dishes: readonly Dish[];
  onToggle: (date: string) => void;
};

const dayNumber = (date: string): number => parseDateKey(date).getDate();

function statusNote(status: DateStatus): string {
  switch (status) {
    case "kept":
      return "Låst, bevares";
    case "replaced":
      return "Erstattes";
    case "left-out":
      return "Ingen madlavning";
    default:
      return "";
  }
}

/** Tap a date to skip or include it. Shows what each date already holds. */
export function DayGrid({ dates, planned, skipped, meals, dishes, onToggle }: Props) {
  return (
    <ul className="m-0 grid list-none grid-cols-7 gap-1.5 p-0 md:gap-2" aria-label="Datoer">
      {dates.map((date) => {
        const status = dateStatus(meals, date);
        const isPlanned = planned.has(date);
        const isSkipped = skipped.has(date);
        const dish = meals[date] ? dishes.find((candidate) => candidate.id === meals[date]?.dishId) : undefined;
        const outside = !isPlanned && !isSkipped;
        const note = statusNote(status);
        // Spoken after the visible text (the accessible name must contain what is shown).
        const spoken = `${weekdayName(date, "long")}, ${
          isSkipped ? "springes over" : isPlanned ? "med i planen" : "ikke med"
        }${note ? `, ${note.toLocaleLowerCase("da-DK")}` : ""}`;
        return (
          <li key={date}>
            <button
              type="button"
              disabled={outside}
              aria-pressed={isPlanned}
              onClick={() => onToggle(date)}
              className={`flex min-h-[64px] w-full flex-col items-center justify-start gap-0.5 rounded-2xl border px-1 py-2 text-center md:min-h-[96px] md:items-start md:px-3 md:text-left ${
                isPlanned
                  ? "border-accent/50 bg-accent-soft text-ink"
                  : isSkipped
                    ? "border-line bg-transparent text-muted"
                    : "border-hairline bg-surface text-muted opacity-60"
              }`}
            >
              <span className="text-xs capitalize">{weekdayName(date, "short").replace(".", "")}</span>
              <span className={`font-display text-xl font-bold leading-none ${isSkipped ? "line-through" : ""}`}>
                {dayNumber(date)}
              </span>
              {status === "kept" ? (
                <Lock size={14} aria-hidden="true" className="mt-1 text-accent" />
              ) : status !== "free" ? (
                <RefreshCw size={14} aria-hidden="true" className="mt-1 text-offer" />
              ) : null}
              {dish ? (
                <span className="hidden w-full truncate text-[13px] leading-tight text-ink-2 md:block">{dish.name}</span>
              ) : null}
              {isSkipped ? <span className="hidden text-[13px] md:block">Springes over</span> : null}
              <span className="sr-only">{`. ${spoken}`}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
