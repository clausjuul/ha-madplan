import { Link } from "react-router";
import type { ReactNode } from "react";
import { CalendarDays, ChevronLeft } from "lucide-react";
import type { ShoppingList } from "@madplan/domain";
import { routePath, type ShoppingTab } from "@/lib/route";
import { rangeTitle } from "@/lib/shopping-view";

type Props = {
  list: ShoppingList;
  today: string;
  wide: boolean;
  onOpenRange: () => void;
  /** Phone: the add-item field sits under the title like in the mockup. */
  addField: ReactNode;
  /** The open tab; undefined is the list. */
  tab: ShoppingTab | undefined;
  /** Shows the "Tilbud" tab; false when no offers are set up. */
  offersOn: boolean;
  /** Watched items ("Tilbudsvagt") on offer right now; shown on the offers tab. */
  watchedOnOffer?: number;
};

const tabClass = (active: boolean): string =>
  `flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[15px] no-underline ${
    active ? "bg-ink font-semibold text-ground" : "font-medium text-ink-2 hover:text-ink"
  }`;

export function ShoppingHeader({ list, today, wide, onOpenRange, addField, tab, offersOn, watchedOnOffer = 0 }: Props) {
  const onList = tab !== "tilbud";
  return (
    <header className={`flex shrink-0 flex-col gap-3 ${wide ? "px-8 pb-5 pt-6" : "px-4 pb-3 pt-[18px]"}`}>
      <div className="flex items-center gap-2.5">
        {wide ? null : (
          <Link
            to="/uge"
            aria-label="Tilbage til ugen"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[26px] font-bold leading-[1.1]">Indkøb</h1>
          {onList ? (
            <button
              type="button"
              onClick={onOpenRange}
              aria-label={`${rangeTitle(list.from, list.to, today)}. Skift slutdato`}
              className="-ml-2 flex min-h-11 items-center gap-1.5 rounded-full bg-transparent px-2 text-[13px] text-muted hover:text-ink"
            >
              <span>{rangeTitle(list.from, list.to, today)}</span>
              <CalendarDays size={15} className="text-accent" aria-hidden="true" />
            </button>
          ) : (
            <p className="m-0 flex min-h-11 items-center text-[13px] text-muted">Fra jeres butikker, hentet i morges</p>
          )}
        </div>
        {onList ? (
          <span className="text-sm font-semibold text-accent" aria-label="Afkrydsede varer">
            {list.checkedCount}/{list.items.length}
          </span>
        ) : null}
      </div>
      {offersOn ? (
        <nav role="tablist" aria-label="Indkøb" className="flex w-fit max-w-full gap-1 rounded-full bg-surface p-1">
          <Link role="tab" aria-selected={onList} to={routePath({ name: "indkob" })} className={tabClass(onList)}>
            Liste
          </Link>
          <Link
            role="tab"
            aria-selected={!onList}
            to={routePath({ name: "indkob", tab: "tilbud" })}
            aria-label={watchedOnOffer > 0 ? `Tilbud. ${watchedOnOffer} af de varer, I holder øje med, er på tilbud` : undefined}
            className={tabClass(!onList)}
          >
            Tilbud
            {watchedOnOffer > 0 ? (
              <span aria-hidden="true" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-offer px-1.5 text-[12px] font-semibold text-on-offer">
                {watchedOnOffer}
              </span>
            ) : null}
          </Link>
        </nav>
      ) : null}
      {onList ? addField : null}
    </header>
  );
}
