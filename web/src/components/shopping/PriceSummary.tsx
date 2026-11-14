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

export function PriceSummary({ list, footer }: { list: ShoppingList; footer?: boolean }) {
  const stores = offerStores(list.items);
  const offers =
    list.offerItemCount > 0
      ? `${list.offerItemCount === 1 ? "1 tilbud" : `${list.offerItemCount} tilbud`}${stores ? ` · ${stores}` : ""}`
      : "";
  return (
    <div
      className={`flex items-center gap-3 ${
        footer ? "shrink-0 border-t border-hairline bg-[#111317] px-4 pb-[18px] pt-3.5" : "rounded-3xl bg-surface p-5"
      }`}
    >
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
