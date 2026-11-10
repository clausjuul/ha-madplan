import {
  addDaysToKey,
  formatShortDate,
  weekdayName,
  type ShoppingCategory,
  type ShoppingList,
  type ShoppingListItem,
} from "@madplan/domain";
import { mondayOf } from "./route";

export const CATEGORY_ORDER: readonly ShoppingCategory[] = [
  "Frugt og grønt",
  "Kød og fisk",
  "Køl",
  "Brød",
  "Frost",
  "Kolonial",
  "Andet",
];

export type ItemGroup = { category: ShoppingCategory; items: ShoppingListItem[] };

/** Groups items by shop category in walking order; empty categories are left out. */
export function groupByCategory(items: readonly ShoppingListItem[]): ItemGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);
}

export type RangeChip = { id: "week" | "7" | "14"; label: string; to: string };

/** Quick end dates; the list always starts today. */
export function rangeChips(today: string): RangeChip[] {
  return [
    { id: "week", label: "Resten af ugen", to: addDaysToKey(mondayOf(today), 6) },
    { id: "7", label: "7 dage", to: addDaysToKey(today, 6) },
    { id: "14", label: "14 dage", to: addDaysToKey(today, 13) },
  ];
}

/** First chip whose end date equals `to` (so the matching one is highlighted). */
export function activeChip(today: string, to: string): RangeChip["id"] | undefined {
  return rangeChips(today).find((chip) => chip.to === to)?.id;
}

/** "Til i dag – søndag 15. nov." */
export function rangeTitle(from: string, to: string, today: string): string {
  const start = from === today ? "i dag" : `${weekdayName(from)} ${formatShortDate(from)}`;
  return to === from ? `Til ${start}` : `Til ${start} – ${weekdayName(to)} ${formatShortDate(to)}`;
}

/** Ignores a remembered end date once it is in the past. */
export function usableEnd(stored: string | null | undefined, today: string): string | undefined {
  return stored && /^\d{4}-\d{2}-\d{2}$/u.test(stored) && stored >= today ? stored : undefined;
}

const recount = (list: ShoppingList, items: ShoppingListItem[]): ShoppingList => ({
  ...list,
  items,
  checkedCount: items.filter((item) => item.checked).length,
  totalEstimatedPrice: items.reduce((total, item) => total + item.estimatedPrice, 0),
  offerItemCount: items.filter((item) => item.priceIsOffer).length,
});

/** Optimistic version of POST shopping/toggle. */
export function toggleItemIn(list: ShoppingList, itemId: string): ShoppingList {
  return recount(
    list,
    list.items.map((item) => (item.id === itemId ? { ...item, checked: !item.checked } : item)),
  );
}

/** Optimistic version of DELETE shopping/extras/:itemId. */
export function removeItemIn(list: ShoppingList, itemId: string): ShoppingList {
  return recount(
    list,
    list.items.filter((item) => item.id !== itemId),
  );
}

/** "Netto" / "Netto og REMA 1000" for the offer chip. */
export function offerStores(items: readonly ShoppingListItem[]): string {
  const stores = [...new Set(items.flatMap((item) => (item.priceIsOffer && item.offer ? [item.offer.store] : [])))];
  return stores.join(" og ");
}
