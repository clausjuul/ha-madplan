import { Link } from "react-router";
import type { ReactNode } from "react";
import { CalendarDays, ChevronLeft, Tag } from "lucide-react";
import type { ShoppingList } from "@madplan/domain";
import { rangeTitle } from "@/lib/shopping-view";

type Props = {
  list: ShoppingList;
  today: string;
  wide: boolean;
  onOpenRange: () => void;
  /** Phone: the add-item field sits under the title like in the mockup. */
  addField: ReactNode;
  /** Opens the offers list; omitted when no offers are set up. */
  onOpenOffers?: () => void;
};

export function ShoppingHeader({ list, today, wide, onOpenRange, addField, onOpenOffers }: Props) {
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
          <button
            type="button"
            onClick={onOpenRange}
            aria-label={`${rangeTitle(list.from, list.to, today)}. Skift slutdato`}
            className="-ml-2 flex min-h-11 items-center gap-1.5 rounded-full bg-transparent px-2 text-[13px] text-muted hover:text-ink"
          >
            <span>{rangeTitle(list.from, list.to, today)}</span>
            <CalendarDays size={15} className="text-accent" aria-hidden="true" />
          </button>
        </div>
        {onOpenOffers ? (
          <button
            type="button"
            onClick={onOpenOffers}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-offer-soft px-3.5 text-[14px] font-semibold text-offer"
          >
            <Tag size={16} aria-hidden="true" />
            Tilbud
          </button>
        ) : null}
        <span className="text-sm font-semibold text-accent" aria-label="Afkrydsede varer">
          {list.checkedCount}/{list.items.length}
        </span>
      </div>
      {addField}
    </header>
  );
}
