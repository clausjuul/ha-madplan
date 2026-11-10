import type { ReactNode } from "react";
import { CalendarDays, ChevronLeft } from "lucide-react";
import type { ShoppingList } from "@madplan/domain";
import { rangeTitle } from "@/lib/shopping-view";

type Props = {
  list: ShoppingList;
  today: string;
  wide: boolean;
  onOpenRange: () => void;
  /** Phone: the add-item field sits under the title like in the mockup. */
  addField: ReactNode;
};

export function ShoppingHeader({ list, today, wide, onOpenRange, addField }: Props) {
  return (
    <header className={`flex shrink-0 flex-col gap-3 ${wide ? "px-8 pb-5 pt-6" : "px-4 pb-3 pt-[18px]"}`}>
      <div className="flex items-center gap-2.5">
        {wide ? null : (
          <a
            href="#/uge"
            aria-label="Tilbage til ugen"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </a>
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
        <span className="text-sm font-semibold text-accent" aria-label="Afkrydsede varer">
          {list.checkedCount}/{list.items.length}
        </span>
      </div>
      {addField}
    </header>
  );
}
