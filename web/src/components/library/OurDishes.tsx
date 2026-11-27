import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { createHistoryInsights, type BootstrapResponse } from "@madplan/domain";
import {
  SORT_LABELS,
  categoriesOf,
  filterDishes,
  lastEatenLabel,
  sortDishes,
  type SortKey,
} from "@/lib/library";
import { DishCard } from "./DishCard";
import { HistoryStrip } from "./HistoryStrip";

type Props = {
  data: BootstrapResponse;
  today: string;
  /** Opens "Tilføj ret": from a link, text or photo, or written by hand. */
  onAdd: () => void;
};

const chip = (active: boolean): string =>
  `flex h-11 shrink-0 items-center rounded-full px-4 text-[15px] ${
    active ? "bg-ink font-semibold text-ground" : "bg-surface text-ink-2 hover:text-ink"
  }`;

export function OurDishes({ data, today, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("name");

  const active = useMemo(() => data.dishes.filter((dish) => !dish.archivedAt), [data.dishes]);
  const insights = useMemo(
    () => createHistoryInsights(data.meals, active, today, 6),
    [data.meals, active, today],
  );
  const categories = useMemo(() => categoriesOf(active), [active]);
  const visible = useMemo(
    () => sortDishes(filterDishes(active, query, category), sort, insights.lastEatenByDish),
    [active, query, category, sort, insights.lastEatenByDish],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative basis-full sm:min-w-[220px] sm:flex-1 sm:basis-0">
          <span className="sr-only">Søg i retter</span>
          <Search size={18} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Søg i navn, kategori eller ingrediens"
            className="h-12 w-full rounded-full border border-line bg-surface pl-11 pr-4 text-[15px] text-ink outline-none placeholder:text-muted focus:border-accent"
          />
        </label>
        <button type="button" onClick={onAdd} className="flex h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent sm:flex-none">
          <Plus size={18} aria-hidden="true" />
          Tilføj ret
        </button>
      </div>

      <HistoryStrip mostEaten={insights.mostEaten} longestSince={insights.longestSince} today={today} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] min-w-0 gap-2 overflow-x-auto px-4 md:mx-0 md:w-auto md:flex-1 md:px-0" role="group" aria-label="Kategori">
          <button type="button" aria-pressed={category === null} className={chip(category === null)} onClick={() => setCategory(null)}>
            Alle
          </button>
          {categories.map((name) => (
            <button key={name} type="button" aria-pressed={category === name} className={chip(category === name)} onClick={() => setCategory(category === name ? null : name)}>
              {name}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          Sortér
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-11 rounded-full border border-line bg-surface px-4 text-[15px] text-ink"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-3xl bg-surface p-8 text-center text-[15px] text-ink-2">
          {active.length === 0
            ? "I har ingen retter endnu. Tryk Tilføj ret for at hente en opskrift fra et link, en tekst eller et foto, eller skriv den selv. Du kan også finde idéer under Opdag."
            : "Ingen retter matcher. Prøv en anden søgning, eller tilføj en ny ret."}
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] md:gap-4">
          {visible.map((dish) => {
            const last = insights.lastEatenByDish.get(dish.id);
            return (
              <li key={dish.id} className="flex">
                <DishCard dish={dish} lastLabel={lastEatenLabel(last, today)} tried={Boolean(last)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
