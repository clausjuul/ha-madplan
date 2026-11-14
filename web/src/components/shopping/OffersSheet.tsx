import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { offerPriceLabel, offerSavingKr, STORE_NAMES } from "@madplan/domain";
import type { Dish, GroceryStore, RetailOffer, ShoppingCategory, ShoppingList } from "@madplan/domain";
import { useOffers } from "@/api/queries";
import { Sheet } from "@/components/ui/Sheet";
import { notify } from "@/lib/notify";
import {
  capGroups,
  decorateOffers,
  filterShown,
  loadSort,
  NO_FILTERS,
  saveSort,
  SORT_OPTIONS,
  sortAndGroup,
  type OfferFilters,
  type OfferSort,
  type ShownOffer,
} from "@/lib/offers-view";
import { CATEGORY_ORDER } from "@/lib/shopping-view";

const SHOWN = 150;

type Props = {
  open: boolean;
  onClose: () => void;
  list: ShoppingList;
  stores: GroceryStore[];
  dishes: readonly Dish[];
  today: string;
  onAdd: (label: string) => void;
};

const kroner = (ore: number): string => `${(ore / 100).toFixed(2).replace(".", ",")} kr.`;
const shortDate = (key: string): string =>
  new Date(`${key}T12:00:00`).toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" });

const selectClass =
  "h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-3.5 text-[15px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent";

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-10 shrink-0 rounded-full px-4 text-[14px] font-medium ${
        on ? "bg-accent text-on-accent" : "border border-line bg-surface text-ink-2"
      }`}
    >
      {children}
    </button>
  );
}

function OfferRow({ entry, onAdd }: { entry: ShownOffer; onAdd: (offer: RetailOffer) => void }) {
  const { offer } = entry;
  const saving = offerSavingKr(offer);
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium leading-snug text-ink">{offer.name}</span>
        <span className="text-[13px] text-muted">
          {[STORE_NAMES[offer.chain], offer.brand, offer.quantityLabel].filter(Boolean).join(" · ")}
        </span>
        <span className="text-[13px] text-muted">
          Til og med {shortDate(offer.validUntil)}
          {entry.dishes.length > 0 ? ` · til ${entry.dishes.join(", ")}` : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="text-[15px] font-semibold text-offer">{offerPriceLabel(offer)}</span>
        {offer.normalPriceOre ? (
          <span className="text-[12px] text-muted">
            <span className="line-through">{kroner(offer.normalPriceOre)}</span>
            {saving >= 1 ? ` · ${entry.discountPct ?? 0} %` : ""}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => onAdd(offer)}
        aria-label={`Læg ${offer.name} på indkøbslisten`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised text-ink-2 hover:text-ink"
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

/** Every stored offer from the chosen stores: search, sort, filter, add one to the list. Never calls Prej. */
export function OffersSheet({ open, onClose, list, stores, dishes, today, onAdd }: Props) {
  const offers = useOffers(open);
  const [filters, setFilters] = useState<OfferFilters>(NO_FILTERS);
  const [sort, setSort] = useState<OfferSort>(loadSort);
  const set = (patch: Partial<OfferFilters>): void => setFilters((current) => ({ ...current, ...patch }));

  const all = useMemo(
    () => decorateOffers((offers.data?.offers ?? []).filter((offer) => stores.includes(offer.chain)), dishes, stores, today),
    [offers.data, stores, dishes, today],
  );
  const found = useMemo(() => filterShown(all, filters, today), [all, filters, today]);
  const groups = useMemo(() => capGroups(sortAndGroup(found, sort), SHOWN), [found, sort]);
  const categories = useMemo(() => CATEGORY_ORDER.filter((category) => all.some((entry) => entry.category === category)), [all]);
  const filtered = filters.store !== "alle" || filters.category !== "alle" || filters.fitsDishes || filters.endingSoon || filters.query.trim() !== "";
  const onList = list.items.filter((item) => !item.checked && item.priceIsOffer && item.offer);
  const add = (offer: RetailOffer): void => {
    onAdd(offer.name);
    notify(`«${offer.name}» er lagt på indkøbslisten.`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Tilbud" subtitle="Fra jeres butikker, hentet i morges" tall>
      <div className="flex flex-col gap-4 px-1 pb-2">
        {onList.length > 0 ? (
          <section aria-label="På jeres indkøbsliste" className="flex flex-col gap-1.5">
            <h3 className="m-0 text-[13px] font-semibold uppercase tracking-[0.05em] text-muted">På jeres indkøbsliste</h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {onList.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 text-[15px]">
                  <span className="min-w-0 first-letter:uppercase">{item.label}</span>
                  <span className="shrink-0 text-[14px] font-semibold text-offer">
                    {item.offer?.price} · {item.offer?.store}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <label className="flex h-12 items-center gap-2 rounded-full bg-surface px-4">
          <Search size={18} aria-hidden="true" className="text-muted" />
          <span className="sr-only">Søg i tilbud</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => set({ query: event.target.value })}
            placeholder="Søg, f.eks. kylling"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
          />
        </label>

        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] text-muted">
            Sortér
            <select
              value={sort}
              onChange={(event) => {
                const next = event.target.value as OfferSort;
                setSort(next);
                saveSort(next);
              }}
              className={selectClass}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] text-muted">
            Kategori
            <select
              value={filters.category}
              onChange={(event) => set({ category: event.target.value as ShoppingCategory | "alle" })}
              className={selectClass}
            >
              <option value="alle">Alle kategorier</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtre">
          {stores.length > 1
            ? (["alle", ...stores] as const).map((option) => (
                <Chip key={option} on={filters.store === option} onClick={() => set({ store: option })}>
                  {option === "alle" ? "Alle butikker" : STORE_NAMES[option]}
                </Chip>
              ))
            : null}
          <Chip on={filters.fitsDishes} onClick={() => set({ fitsDishes: !filters.fitsDishes })}>
            Passer til jeres retter
          </Chip>
          <Chip on={filters.endingSoon} onClick={() => set({ endingSoon: !filters.endingSoon })}>
            Udløber snart
          </Chip>
        </div>

        {offers.isPending ? (
          <div className="skeleton h-40 rounded-2xl" aria-label="Henter tilbud" />
        ) : all.length === 0 ? (
          <p className="m-0 rounded-2xl bg-surface px-4 py-5 text-[15px] leading-relaxed text-ink-2">
            Der er ingen tilbud endnu. Vælg jeres butikker under Indstillinger → Butikker og tilbud. Tilbuddene hentes hver
            morgen, og første gang lige efter opstart.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="m-0 text-[13px] text-muted" aria-live="polite">
                {found.length === all.length ? `${all.length} tilbud` : `${found.length} af ${all.length} tilbud`}
                {found.length > SHOWN ? `. Viser ${SHOWN}; søg eller filtrér for at finde resten.` : ""}
              </p>
              {filtered ? (
                <button
                  type="button"
                  onClick={() => setFilters(NO_FILTERS)}
                  className="flex min-h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[14px] font-medium text-ink-2 hover:text-ink"
                >
                  <X size={15} aria-hidden="true" />
                  Nulstil filtre
                </button>
              ) : null}
            </div>
            {found.length === 0 ? (
              <p className="m-0 rounded-2xl bg-surface px-4 py-5 text-[15px] text-ink-2">Ingen tilbud passer til filtrene.</p>
            ) : (
              groups.map((group) => (
                <section key={group.title ?? "alle"} aria-label={group.title ?? "Tilbud"} className="flex flex-col gap-1.5">
                  {group.title ? (
                    <h3 className="m-0 text-[13px] font-semibold uppercase tracking-[0.05em] text-muted">
                      {group.title} · {group.offers.length}
                    </h3>
                  ) : null}
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {group.offers.map((entry) => (
                      <OfferRow key={entry.key} entry={entry} onAdd={add} />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
        <p className="m-0 text-[13px] text-muted">
          Data fra{" "}
          <a href="https://prej.dk" target="_blank" rel="noreferrer" className="text-ink-2 underline">
            Prej
          </a>
        </p>
      </div>
    </Sheet>
  );
}
