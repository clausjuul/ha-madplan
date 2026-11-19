import { formatPrice, STORE_NAMES, type ShoppingList } from "@madplan/domain";
import { offerStores } from "@/lib/shopping-view";

/** Estimated total and offer count. `footer` = full-width sticky bar on phones; otherwise a card. */
/** "Billigst: Netto 412 kr. · REMA 1000 438 kr." for the items both stores have on offer, or null. */
export function cheapestLine(list: ShoppingList): string | null {
  const basket = list.basket;
  if (!basket || basket.commonTotals.length < 2 || basket.commonCount === 0) return null;
  const sorted = [...basket.commonTotals].sort((a, b) => a.totalOre - b.totalOre);
  const prices = sorted.map((entry) => `${STORE_NAMES[entry.store]} ${formatPrice(entry.totalOre / 100)}`).join(" · ");
  return `Billigst på ${basket.commonCount} ${basket.commonCount === 1 ? "tilbudsvare" : "tilbudsvarer"}: ${prices}`;
}

/** Estimated price of what is not in the basket yet. */
export const remainingPrice = (list: ShoppingList): number =>
  list.items.reduce((total, item) => total + (item.checked ? 0 : item.estimatedPrice), 0);

export function PriceSummary({ list, footer }: { list: ShoppingList; footer?: boolean }) {
  const stores = offerStores(list.items);
  const offers =
    list.offerItemCount > 0
      ? `${list.offerItemCount === 1 ? "1 tilbud" : `${list.offerItemCount} tilbud`}${stores ? ` · ${stores}` : ""}`
      : "";
  if (footer) {
    const left = remainingPrice(list);
    const started = list.checkedCount > 0 && left > 0;
    return (
      <div className="flex shrink-0 items-center gap-3 border-t border-hairline bg-surface px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[22px] font-bold leading-tight">
              {list.totalEstimatedPrice > 0 ? `ca. ${formatPrice(list.totalEstimatedPrice)}` : "Ingen pris endnu"}
            </span>
            {started ? <span className="truncate text-[13px] text-muted">{`ca. ${formatPrice(left)} tilbage`}</span> : null}
          </div>
          {cheapestLine(list) ? <div className="truncate text-[12px] text-ink-2">{cheapestLine(list)}</div> : null}
        </div>
        {offers ? (
          <span className="max-w-[45%] shrink-0 truncate rounded-full bg-offer-soft px-3 py-1.5 text-[13px] font-semibold text-offer">{offers}</span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-surface p-5">
      <div className="flex-1">
        <div className="text-[13px] text-muted">Forventet pris</div>
        <div className="font-display text-[26px] font-bold leading-tight">
          {list.totalEstimatedPrice > 0 ? `ca. ${formatPrice(list.totalEstimatedPrice)}` : "Ingen pris endnu"}
        </div>
        {cheapestLine(list) ? <div className="mt-1 text-[13px] text-ink-2">{cheapestLine(list)}</div> : null}
        {list.basket ? <div className="mt-0.5 text-[12px] text-muted">Tilbud: data fra Prej</div> : null}
      </div>
      {offers ? (
        <span className="rounded-full bg-offer-soft px-3 py-2 text-[13px] font-semibold text-offer">{offers}</span>
      ) : null}
    </div>
  );
}
