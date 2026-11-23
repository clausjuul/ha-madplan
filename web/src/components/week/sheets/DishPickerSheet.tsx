import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  eatenHistory,
  formatShortDate,
  lastEatenByDish,
  weekdayName,
  type Dish,
  type MealMap,
} from "@madplan/domain";
import { Sheet } from "@/components/ui/Sheet";
import { DishImage } from "@/components/ui/DishImage";

type Props = {
  open: boolean;
  dayLabel: string;
  dishes: readonly Dish[];
  meals: MealMap;
  today: string;
  onPick: (dishId: string) => void;
  onClose: () => void;
  /** Return a short Danish reason to show a dish as unavailable (it can then not be picked). */
  disabledReason?: (dish: Dish) => string | undefined;
  /** dishId -> "Allerede onsdag": dishes already used nearby, marked so they are not picked twice by accident. */
  planned?: ReadonlyMap<string, string>;
  /** Good fits for the day, shown first (before searching) with their reason. */
  suggested?: readonly { dishId: string; reason: string }[];
};

/** dishId -> "Allerede fredag" for the dishes on the other days (the first day wins). */
export function plannedLabels(days: readonly { date: string; dishId: string | undefined }[], except: string): Map<string, string> {
  const labels = new Map<string, string>();
  for (const day of days) {
    if (day.date === except || !day.dishId || labels.has(day.dishId)) continue;
    labels.set(day.dishId, `Allerede ${weekdayName(day.date)}`);
  }
  return labels;
}

export function DishPickerSheet({ open, dayLabel, dishes, meals, today, onPick, onClose, disabledReason, planned, suggested }: Props) {
  const [query, setQuery] = useState("");
  const lastEaten = useMemo(() => lastEatenByDish(eatenHistory(meals, today)), [meals, today]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("da-DK");
    return dishes
      .filter((dish) => !dish.archivedAt)
      .filter(
        (dish) =>
          !needle ||
          dish.name.toLocaleLowerCase("da-DK").includes(needle) ||
          dish.category.toLocaleLowerCase("da-DK").includes(needle) ||
          dish.ingredients.some((ingredient) => ingredient.toLocaleLowerCase("da-DK").includes(needle)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "da-DK"));
  }, [dishes, query]);

  const close = (): void => {
    setQuery("");
    onClose();
  };
  const byId = new Map(dishes.map((dish) => [dish.id, dish]));
  const fits = query.trim()
    ? []
    : (suggested ?? []).flatMap((entry) => {
        const dish = byId.get(entry.dishId);
        return dish && !dish.archivedAt ? [{ dish, reason: entry.reason }] : [];
      });

  const row = (dish: Dish, line?: string) => {
    const last = lastEaten.get(dish.id);
    const blocked = disabledReason?.(dish);
    const already = planned?.get(dish.id);
    return (
      <li key={dish.id}>
        <button
          type="button"
          disabled={blocked !== undefined}
          onClick={() => {
            setQuery("");
            onPick(dish.id);
          }}
          className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl p-2 text-left text-ink hover:bg-raised disabled:opacity-45 disabled:hover:bg-transparent"
        >
          <DishImage dish={dish} width={56} height={56} decorative className="h-14 w-14 shrink-0 rounded-xl" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-base font-semibold">{dish.name}</span>
              {already ? (
                <span className="shrink-0 rounded-full bg-offer-soft px-2 py-0.5 text-xs font-semibold text-offer">{already}</span>
              ) : null}
            </span>
            <span className="block text-[13px] text-muted">
              {blocked ?? line ?? `${dish.prepMinutes} min · ${last ? `Sidst spist ${formatShortDate(last)}` : "Ikke spist endnu"}`}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <Sheet open={open} onClose={close} title="Vælg ret" subtitle={dayLabel} tall>
      <div className="flex h-full min-h-0 flex-col gap-2">
        <label className="relative mx-3 block">
          <span className="sr-only">Søg i retter</span>
          <Search
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Søg i navn eller ingrediens"
            className="h-12 w-full rounded-full bg-raised pl-11 pr-4 text-base text-ink placeholder:text-muted"
          />
        </label>
        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
          {fits.length > 0 ? (
            <>
              <li className="px-3 pb-1 pt-2 text-sm font-semibold text-muted">Passer godt</li>
              {fits.map((entry) => row(entry.dish, `${entry.dish.prepMinutes} min · ${entry.reason}`))}
              <li className="px-3 pb-1 pt-4 text-sm font-semibold text-muted">Alle retter</li>
            </>
          ) : null}
          {visible.map((dish) => row(dish))}
          {visible.length === 0 ? (
            <li className="px-4 py-10 text-center text-[15px] text-muted">Ingen retter matcher “{query}”.</li>
          ) : null}
        </ul>
      </div>
    </Sheet>
  );
}
