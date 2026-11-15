import { useMemo, useState } from "react";
import { BellPlus, Plus, X } from "lucide-react";
import {
  multiBuyLabel,
  offerPriceLabel,
  productLabel,
  sameWatch,
  STORE_NAMES,
  watchedProduct,
  WATCH_NAME_MAX,
  WATCHLIST_MAX,
  watchWordsMatch,
} from "@madplan/domain";
import type { RetailOffer, WatchHit, WatchItem } from "@madplan/domain";

/** Offers shown per watched item; the rest are found by searching the full list. */
const PER_ITEM = 3;
/** Products suggested while typing. */
const SUGGESTIONS = 6;

type Props = {
  watchlist: readonly WatchItem[];
  /** Undefined while the offers are loading. */
  hits: readonly WatchHit[] | undefined;
  /** Current offers in the chosen stores, to pick an exact product from. */
  offers: readonly RetailOffer[];
  onChange: (watchlist: WatchItem[]) => void;
  onAdd: (offer: RetailOffer) => void;
};

const shortDate = (key: string): string =>
  new Date(`${key}T12:00:00`).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" });

/** Adds an item unless its name is empty, it is already watched or the list is full. */
export function addWatch(watchlist: readonly WatchItem[], item: WatchItem): WatchItem[] {
  const name = item.name.trim().slice(0, WATCH_NAME_MAX);
  if (!name || watchlist.length >= WATCHLIST_MAX) return [...watchlist];
  const next = { ...item, name };
  return watchlist.some((existing) => sameWatch(existing, next)) ? [...watchlist] : [...watchlist, next];
}

/** Watches or unwatches one exact product (the bell on an offer). */
export function toggleProduct(watchlist: readonly WatchItem[], offer: RetailOffer): WatchItem[] {
  const item: WatchItem = { name: productLabel(offer), product: watchedProduct(offer) };
  return watchlist.some((existing) => sameWatch(existing, item))
    ? watchlist.filter((existing) => !sameWatch(existing, item))
    : addWatch(watchlist, item);
}

/** Distinct products whose name or brand has every typed word, cheapest offer of each. */
export function productSuggestions(offers: readonly RetailOffer[], text: string, max = SUGGESTIONS): RetailOffer[] {
  if (text.trim().length < 2) return [];
  const seen = new Map<string, RetailOffer>();
  for (const offer of offers) {
    if (!watchWordsMatch(text, offer)) continue;
    const key = offer.productId !== undefined ? `id-${offer.productId}` : `n-${productLabel(offer).toLocaleLowerCase("da-DK")}`;
    const current = seen.get(key);
    if (!current || offer.amountOre < current.amountOre) seen.set(key, offer);
  }
  return [...seen.values()].sort((a, b) => productLabel(a).localeCompare(productLabel(b), "da-DK")).slice(0, max);
}

const watchKey = (item: WatchItem): string =>
  item.product ? `p-${item.product.productId ?? `${item.product.brand ?? ""}-${item.product.name}`}` : `w-${item.name}`;

/** "Tilbudsvagt": items the family watches, with the current offers on each (on offer first). */
export function WatchSection({ watchlist, hits, offers, onChange, onAdd }: Props) {
  const [value, setValue] = useState("");
  const suggestions = useMemo(() => productSuggestions(offers, value), [offers, value]);
  const addWords = (event: { preventDefault: () => void }): void => {
    event.preventDefault();
    onChange(addWatch(watchlist, { name: value }));
    setValue("");
  };
  const addProduct = (offer: RetailOffer): void => {
    onChange(addWatch(watchlist, { name: productLabel(offer), product: watchedProduct(offer) }));
    setValue("");
  };
  const found = new Map((hits ?? []).map((hit) => [hit.item, hit.offers]));
  const offersOf = (item: WatchItem): RetailOffer[] => found.get(item) ?? [];
  const sorted = [...watchlist].sort((a, b) => Number(offersOf(b).length > 0) - Number(offersOf(a).length > 0));
  const onOffer = watchlist.filter((item) => offersOf(item).length > 0).length;

  return (
    <section aria-labelledby="watch-title" className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
      <div>
        <h3 id="watch-title" className="m-0 text-[15px] font-semibold text-ink">
          Tilbudsvagt
          {hits && onOffer > 0 ? <span className="font-normal text-offer"> · {onOffer} på tilbud</span> : null}
        </h3>
        <p className="m-0 mt-0.5 text-[13px] text-muted">
          Hold øje med alt med et ord (f.eks. kaffe) eller en præcis vare. Tjekkes mod tilbuddene hver morgen.
        </p>
      </div>

      {sorted.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {sorted.map((item) => {
            const matches = offersOf(item);
            return (
              <li key={watchKey(item)} className="flex flex-col gap-1 rounded-xl bg-raised px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-medium text-ink first-letter:uppercase">{item.name}</span>
                    <span className="text-[12px] text-muted">{item.product ? "Præcis vare" : `Alt med «${item.name}»`}</span>
                  </span>
                  {hits === undefined ? null : matches.length === 0 ? (
                    <span className="shrink-0 text-[13px] text-muted">Ikke på tilbud</span>
                  ) : (
                    <span className="shrink-0 text-[13px] font-semibold text-offer">{matches.length} tilbud</span>
                  )}
                  <button
                    type="button"
                    aria-label={`Stop med at holde øje med ${item.name}`}
                    onClick={() => onChange(watchlist.filter((existing) => existing !== item))}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                {matches.length > 0 ? (
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {matches.slice(0, PER_ITEM).map((offer) => (
                      <li key={`${offer.chain}-${offer.productId ?? offer.name}`} className="flex items-center gap-2">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-[14px] leading-snug text-ink-2">{productLabel(offer)}</span>
                          <span className="text-[12px] text-muted">
                            {[STORE_NAMES[offer.chain], offer.quantityLabel, `til og med ${shortDate(offer.validUntil)}`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end font-semibold text-offer">
                          <span className="text-[14px]">{offerPriceLabel({ amountOre: offer.amountOre })}</span>
                          {offer.multiBuy ? <span className="text-[12px]">{multiBuyLabel(offer)}</span> : null}
                        </span>
                        <button
                          type="button"
                          onClick={() => onAdd(offer)}
                          aria-label={`Læg ${offer.name} på indkøbslisten`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink-2 hover:text-ink"
                        >
                          <Plus size={16} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                    {matches.length > PER_ITEM ? (
                      <li className="text-[12px] text-muted">+ {matches.length - PER_ITEM} mere; søg efter «{item.name}» nedenfor.</li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {watchlist.length < WATCHLIST_MAX ? (
        <>
          <form onSubmit={addWords} className="flex h-11 items-center gap-2 rounded-full border border-line pl-4 pr-1">
            <label className="flex-1">
              <span className="sr-only">Hold øje med en vare</span>
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="F.eks. kaffe, Lurpak smør, Coca-Cola"
                autoComplete="off"
                maxLength={WATCH_NAME_MAX}
                className="h-11 w-full border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
              />
            </label>
            <button
              type="submit"
              aria-label={value.trim() ? `Hold øje med alt med «${value.trim()}»` : "Hold øje med varen"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-ink"
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </form>
          {value.trim().length >= 2 ? (
            <div className="flex flex-col gap-1" aria-live="polite">
              <button
                type="button"
                onClick={addWords}
                className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-left text-[14px] text-ink-2 hover:bg-raised"
              >
                <Plus size={16} aria-hidden="true" className="shrink-0 text-muted" />
                Alt med «{value.trim()}»
              </button>
              {suggestions.length > 0 ? (
                <>
                  <p className="m-0 px-3 pt-1 text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">
                    Eller en præcis vare på tilbud nu
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                    {suggestions.map((offer) => (
                      <li key={`${offer.chain}-${offer.productId ?? offer.name}`}>
                        <button
                          type="button"
                          onClick={() => addProduct(offer)}
                          aria-label={`Hold øje med præcis ${productLabel(offer)}`}
                          className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left hover:bg-raised"
                        >
                          <BellPlus size={16} aria-hidden="true" className="shrink-0 text-muted" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-[14px] text-ink">{productLabel(offer)}</span>
                            <span className="text-[12px] text-muted">
                              {[offer.quantityLabel, `${STORE_NAMES[offer.chain]} ${offerPriceLabel(offer)}`].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
