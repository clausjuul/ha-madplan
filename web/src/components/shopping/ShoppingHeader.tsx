import { Link } from "react-router";
import { CalendarDays, MoreHorizontal, Sun, SunDim } from "lucide-react";
import type { ShoppingList } from "@madplan/domain";
import { routePath, type ShoppingTab } from "@/lib/route";
import { rangeTitle } from "@/lib/shopping-view";
import type { KeepAwake } from "@/hooks/use-wake-lock";

type Props = {
  list: ShoppingList;
  today: string;
  wide: boolean;
  onOpenRange: () => void;
  /** The open tab; undefined is the list. */
  tab: ShoppingTab | undefined;
  /** Shows the "Tilbud" tab; false when no offers are set up. */
  offersOn: boolean;
  /** Watched items ("Tilbudsvagt") on offer right now; shown on the offers tab. */
  watchedOnOffer?: number;
  keepAwake: KeepAwake;
  onToggleAwake: () => void;
  /** Phone: opens the sheet with basisvarer and "Ny indkøbstur". */
  onOpenMenu?: () => void;
};

const tabClass = (active: boolean): string =>
  `flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[15px] no-underline ${
    active ? "bg-ink font-semibold text-ground" : "font-medium text-ink-2 hover:text-ink"
  }`;

const iconButton = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full";

export function ShoppingHeader(props: Props) {
  const { list, today, wide, onOpenRange, tab, offersOn, watchedOnOffer = 0, keepAwake, onToggleAwake, onOpenMenu } = props;
  const onList = tab !== "tilbud";
  const total = list.items.length;
  const progress = total > 0 ? list.checkedCount / total : 0;
  const count = (
    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-accent" aria-label={`${list.checkedCount} af ${total} varer i kurven`}>
      {list.checkedCount}
      <span className="font-normal text-muted"> af {total}</span>
    </span>
  );

  return (
    <header className={`relative flex shrink-0 flex-col gap-2.5 ${wide ? "px-8 pb-5 pt-6" : "px-4 pb-3 pt-3"}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className={`font-display font-bold leading-[1.1] ${wide ? "text-[26px]" : "text-[24px]"}`}>Indkøb</h1>
          {onList ? (
            <button
              type="button"
              onClick={onOpenRange}
              aria-label={`${rangeTitle(list.from, list.to, today)}. Skift slutdato`}
              className="-my-2 -ml-2 flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-transparent px-2 text-[13px] text-muted hover:text-ink"
            >
              <span className="truncate">{rangeTitle(list.from, list.to, today)}</span>
              <CalendarDays size={15} className="shrink-0 text-accent" aria-hidden="true" />
            </button>
          ) : (
            <p className="m-0 truncate text-[13px] text-muted">Fra jeres butikker, hentet i morges</p>
          )}
        </div>
        {keepAwake.supported ? (
          <button
            type="button"
            onClick={onToggleAwake}
            aria-pressed={keepAwake.wanted}
            aria-label="Hold skærmen tændt"
            title={keepAwake.wanted ? "Skærmen holdes tændt" : "Hold skærmen tændt"}
            className={`${iconButton} ${keepAwake.wanted ? "bg-accent text-on-accent" : "bg-surface text-ink-2 hover:text-ink"}`}
          >
            {keepAwake.wanted ? <Sun size={19} aria-hidden="true" /> : <SunDim size={19} aria-hidden="true" />}
          </button>
        ) : null}
        {onOpenMenu ? (
          <button type="button" onClick={onOpenMenu} aria-label="Flere muligheder" className={`${iconButton} bg-surface text-ink-2 hover:text-ink`}>
            <MoreHorizontal size={20} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {offersOn ? (
        <div className="flex items-center gap-3">
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
          <span className="flex-1" />
          {onList ? count : null}
        </div>
      ) : null}
      {!offersOn && onList && total > 0 ? (
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
          </div>
          {count}
        </div>
      ) : null}
      {offersOn && onList && total > 0 ? (
        <div aria-hidden="true" className={`absolute bottom-0 h-1 overflow-hidden rounded-full bg-surface ${wide ? "inset-x-8" : "inset-x-4"}`}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
    </header>
  );
}
