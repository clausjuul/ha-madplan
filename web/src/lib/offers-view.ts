/** Pure helpers for the offers list: decorate, filter, sort and group stored offers. */
import { addDaysToKey, categorizeIngredient, dishOfferMatches, normalizeItem, offerSavingKr, STORE_NAMES } from "@madplan/domain";
import type { Dish, GroceryStore, RetailOffer, ShoppingCategory } from "@madplan/domain";
import { CATEGORY_ORDER } from "./shopping-view";

export type OfferSort = "besparelse" | "rabat" | "pris" | "udloeber" | "navn" | "kategori" | "butik";

export const SORT_OPTIONS: { id: OfferSort; label: string }[] = [
  { id: "besparelse", label: "Størst besparelse" },
  { id: "rabat", label: "Største rabat (%)" },
  { id: "pris", label: "Laveste pris" },
  { id: "udloeber", label: "Udløber først" },
  { id: "navn", label: "Navn (A-Å)" },
  { id: "kategori", label: "Kategori" },
  { id: "butik", label: "Butik" },
];

export type OfferFilters = {
  query: string;
  store: GroceryStore | "alle";
  category: ShoppingCategory | "alle";
  /** Only offers for an ingredient in one of the family's dishes. */
  fitsDishes: boolean;
  /** Only offers ending within ENDING_SOON_DAYS. */
  endingSoon: boolean;
};

export const NO_FILTERS: OfferFilters = { query: "", store: "alle", category: "alle", fitsDishes: false, endingSoon: false };

/** "Udløber snart": today and the next two days. */
export const ENDING_SOON_DAYS = 2;

export type ShownOffer = {
  offer: RetailOffer;
  key: string;
  category: ShoppingCategory;
  /** 0-100, or null without a normal price. */
  discountPct: number | null;
  /** Names of the family's dishes this offer fits (at most 3). */
  dishes: string[];
};

export type OfferGroup = { title: string | null; offers: ShownOffer[] };

export const offerKey = (offer: RetailOffer): string => `${offer.chain}-${offer.productId ?? offer.name}`;

/** Category, discount and the dishes each offer fits (matched like the planner does). */
export function decorateOffers(offers: readonly RetailOffer[], dishes: readonly Dish[], stores: readonly GroceryStore[], today: string): ShownOffer[] {
  const fits = new Map<RetailOffer, string[]>();
  for (const dish of dishes) {
    if (dish.archivedAt) continue;
    for (const match of dishOfferMatches(dish, offers, stores, today)) {
      const names = fits.get(match.offer) ?? [];
      if (names.length < 3 && !names.includes(dish.name)) names.push(dish.name);
      fits.set(match.offer, names);
    }
  }
  return offers.map((offer) => ({
    offer,
    key: offerKey(offer),
    category: categorizeIngredient(offer.name),
    discountPct: offer.normalPriceOre && offer.normalPriceOre > offer.amountOre
      ? Math.round(((offer.normalPriceOre - offer.amountOre) / offer.normalPriceOre) * 100)
      : null,
    dishes: fits.get(offer) ?? [],
  }));
}

export function filterShown(offers: readonly ShownOffer[], filters: OfferFilters, today: string): ShownOffer[] {
  const words = normalizeItem(filters.query).split(" ").filter(Boolean);
  const soon = addDaysToKey(today, ENDING_SOON_DAYS);
  return offers.filter(({ offer, category, dishes }) => {
    if (filters.store !== "alle" && offer.chain !== filters.store) return false;
    if (filters.category !== "alle" && category !== filters.category) return false;
    if (filters.fitsDishes && dishes.length === 0) return false;
    if (filters.endingSoon && offer.validUntil > soon) return false;
    const text = normalizeItem(`${offer.name} ${offer.brand ?? ""}`);
    return words.every((word) => text.includes(word));
  });
}

const byName = (a: ShownOffer, b: ShownOffer): number => a.offer.name.localeCompare(b.offer.name, "da-DK");
const bySaving = (a: ShownOffer, b: ShownOffer): number => offerSavingKr(b.offer) - offerSavingKr(a.offer) || byName(a, b);

const COMPARE: Record<OfferSort, (a: ShownOffer, b: ShownOffer) => number> = {
  besparelse: bySaving,
  rabat: (a, b) => (b.discountPct ?? -1) - (a.discountPct ?? -1) || bySaving(a, b),
  pris: (a, b) => a.offer.amountOre - b.offer.amountOre || byName(a, b),
  udloeber: (a, b) => a.offer.validUntil.localeCompare(b.offer.validUntil) || bySaving(a, b),
  navn: byName,
  // Within a category or store group, the biggest saving comes first.
  kategori: bySaving,
  butik: bySaving,
};

/** Sorted, and grouped under headings when sorting by category or store. */
export function sortAndGroup(offers: readonly ShownOffer[], sort: OfferSort): OfferGroup[] {
  const sorted = [...offers].sort(COMPARE[sort]);
  if (sort === "kategori") {
    return CATEGORY_ORDER.map((category) => ({ title: category, offers: sorted.filter((entry) => entry.category === category) })).filter(
      (group) => group.offers.length > 0,
    );
  }
  if (sort === "butik") {
    const stores = [...new Set(sorted.map((entry) => entry.offer.chain))].sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b], "da-DK"));
    return stores.map((store) => ({ title: STORE_NAMES[store], offers: sorted.filter((entry) => entry.offer.chain === store) }));
  }
  return [{ title: null, offers: sorted }];
}

/** Caps the number of rows rendered across groups (the rest are found by searching or filtering). */
export function capGroups(groups: readonly OfferGroup[], max: number): OfferGroup[] {
  let left = max;
  return groups.flatMap((group) => {
    if (left <= 0) return [];
    const offers = group.offers.slice(0, left);
    left -= offers.length;
    return [{ ...group, offers }];
  });
}

const SORT_KEY = "madplan.offers.sort";

export function loadSort(): OfferSort {
  try {
    const saved = window.localStorage.getItem(SORT_KEY);
    return SORT_OPTIONS.some((option) => option.id === saved) ? (saved as OfferSort) : "besparelse";
  } catch {
    return "besparelse";
  }
}

export function saveSort(sort: OfferSort): void {
  try {
    window.localStorage.setItem(SORT_KEY, sort);
  } catch {
    // Storage may be blocked; the choice is simply not remembered.
  }
}
