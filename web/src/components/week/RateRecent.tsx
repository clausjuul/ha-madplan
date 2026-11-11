import { useState } from "react";
import { Ban, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { addDaysToKey, weekdayName, type Dish, type MealMap, type MealRating } from "@madplan/domain";

/** How many days back an unrated meal is still asked about. */
const LOOKBACK_DAYS = 3;
const DISMISS_KEY = "madplan:rate-dismissed";

type Props = {
  meals: MealMap;
  dishes: readonly Dish[];
  today: string;
  onRate: (date: string, rating: MealRating) => void;
};

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(dates: string[]): void {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(dates.slice(-20)));
  } catch {
    // Storage is a convenience only.
  }
}

/** The most recent eaten, unrated meal within the lookback window. */
export function mealToRate(meals: MealMap, today: string, dismissed: readonly string[]): string | undefined {
  for (let offset = 1; offset <= LOOKBACK_DAYS; offset += 1) {
    const date = addDaysToKey(today, -offset);
    const meal = meals[date];
    if (meal && !meal.skipped && !meal.rating && !dismissed.includes(date)) return date;
  }
  return undefined;
}

const when = (date: string, today: string): string =>
  date === addDaysToKey(today, -1) ? "i går" : `i ${weekdayName(date)}s`;

const button =
  "flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-raised px-3 text-[15px] font-medium text-ink hover:bg-line";

/** "Hvordan var lasagnen i går?": one tap feeds the family's verdict back into future suggestions. */
export function RateRecent({ meals, dishes, today, onRate }: Props) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const date = mealToRate(meals, today, dismissed);
  const meal = date ? meals[date] : undefined;
  const dish = meal ? dishes.find((entry) => entry.id === meal.dishId) : undefined;
  if (!date || !dish) return null;

  const dismiss = (): void => {
    const next = [...dismissed, date];
    setDismissed(next);
    writeDismissed(next);
  };

  return (
    <section aria-label="Bedøm måltid" className="flex flex-col gap-3 rounded-[22px] bg-surface p-4">
      <div className="flex items-start gap-2">
        <p className="m-0 flex-1 text-base font-semibold">
          Hvordan var {dish.name} {when(date, today)}?
        </p>
        <button type="button" aria-label="Spørg ikke om dette måltid" onClick={dismiss} className="-m-1 p-1 text-muted hover:text-ink">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => onRate(date, "up")}>
          <ThumbsUp size={18} aria-hidden="true" />
          Godt
        </button>
        <button type="button" className={button} onClick={() => onRate(date, "down")}>
          <ThumbsDown size={18} aria-hidden="true" />
          Mindre godt
        </button>
        <button type="button" className={`${button} text-danger`} onClick={() => onRate(date, "never")}>
          <Ban size={18} aria-hidden="true" />
          Ikke igen
        </button>
      </div>
    </section>
  );
}
