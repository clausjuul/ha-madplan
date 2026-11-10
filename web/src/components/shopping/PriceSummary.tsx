import { formatPrice, type ShoppingList } from "@madplan/domain";
import { offerStores } from "@/lib/shopping-view";

/** Estimated total and offer count. `footer` = full-width sticky bar on phones; otherwise a card. */
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
      </div>
      {offers ? (
        <span className="rounded-full bg-offer-soft px-3 py-2 text-[13px] font-semibold text-offer">{offers}</span>
      ) : null}
    </div>
  );
}
