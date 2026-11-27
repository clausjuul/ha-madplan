import { Link } from "react-router";
import { useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import type { Dish } from "@madplan/domain";
import { useDishActions } from "@/api/library-mutations";
import { SectionCard } from "@/components/ui/Controls";
import { DishImage } from "@/components/ui/DishImage";
import { filterDishes } from "@/lib/library";
import { notify } from "@/lib/notify";
import { routePath } from "@/lib/route";

/** Archived dishes: out of the library and the suggestions, history kept; each can be restored. */
export function ArchiveSection({ dishes }: { dishes: readonly Dish[] }) {
  const actions = useDishActions();
  const [query, setQuery] = useState("");
  const archived = useMemo(
    () => [...dishes.filter((dish) => dish.archivedAt)].sort((a, b) => a.name.localeCompare(b.name, "da-DK")),
    [dishes],
  );
  const visible = useMemo(() => filterDishes(archived, query, null), [archived, query]);

  const restore = (dish: Dish): void => {
    actions
      .restore(dish.id)
      .then(() => notify(`${dish.name} er tilbage under Retter.`))
      .catch(() => notify("Retten kunne ikke gendannes. Prøv igen."));
  };

  return (
    <SectionCard
      title={`Arkiverede retter${archived.length ? ` (${archived.length})` : ""}`}
      description="Retter, I har arkiveret, vises ikke under Retter og bliver ikke foreslået. Historikken er bevaret, og I kan gendanne dem her."
    >
      {archived.length === 0 ? (
        <p className="m-0 rounded-2xl bg-ground p-5 text-center text-[15px] text-ink-2">Der er ingen arkiverede retter.</p>
      ) : (
        <>
          {archived.length > 6 ? (
            <label className="relative">
              <span className="sr-only">Søg i arkiverede retter</span>
              <Search size={18} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Søg i arkivet"
                className="h-12 w-full rounded-full border border-line bg-ground pl-11 pr-4 text-[15px] text-ink outline-none placeholder:text-muted focus:border-accent"
              />
            </label>
          ) : null}
          {visible.length === 0 ? (
            <p className="m-0 text-[15px] text-ink-2">Ingen arkiverede retter matcher.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {visible.map((dish) => (
                <li key={dish.id} className="flex items-center gap-3 rounded-2xl py-1.5">
                  <DishImage dish={dish} width={44} height={44} decorative className="h-11 w-11 shrink-0 rounded-xl" />
                  <Link to={routePath({ name: "retter", dishId: dish.id })} className="min-w-0 flex-1 truncate text-[15px] text-ink no-underline hover:underline">
                    {dish.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => restore(dish)}
                    aria-label={`Gendan ${dish.name}`}
                    className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-semibold text-accent hover:bg-raised"
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    Gendan
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </SectionCard>
  );
}
