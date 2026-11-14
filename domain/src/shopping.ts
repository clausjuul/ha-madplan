import { daysInRange } from "./dates.ts";
import {
  categorizeIngredient,
  formatQuantity,
  ingredientsMatch,
  normalizeItem,
  parseIngredient,
  roundUpForPurchase,
} from "./ingredients.ts";
import type { IngredientUnit, ShoppingCategory } from "./ingredients.ts";
import { estimateItemPrice, formatPrice, parseOfferPrice } from "./pricing.ts";
import { baseServings, scaleIngredients } from "./portions.ts";
import { variantPortions } from "./variants.ts";
import { compareBaskets } from "./basket.ts";
import type { BasketComparison } from "./basket.ts";
import { bestOffer, offerResult } from "./offers.ts";
import type {
  Dish,
  FridgeItem,
  GroceryStore,
  MealMap,
  OfferReference,
  Profile,
  RetailOffer,
  ShoppingListState,
} from "./types.ts";

export type ShoppingListItem = {
  id: string;
  label: string;
  quantityLabel: string;
  estimatedPrice: number;
  priceLabel: string;
  priceIsOffer: boolean;
  offer?: OfferReference;
  sourceLabel: string;
  dishNames: string[];
  extra: boolean;
  category: ShoppingCategory;
  checked: boolean;
};

type AggregatedItem = Omit<
  ShoppingListItem,
  "estimatedPrice" | "priceLabel" | "priceIsOffer" | "checked"
> & {
  amount?: number;
  unit?: IngredientUnit;
};

export type ShoppingListInput = {
  /** Identifies the persisted checked/extra state; opaque to this module. */
  listId: string;
  /** Inclusive date range, e.g. today -> last planned day. */
  from: string;
  to: string;
  meals: MealMap;
  dishes: readonly Dish[];
  fridge: readonly FridgeItem[];
  pantry: readonly string[];
  /** Checked ids and extra items for this list id. */
  state?: ShoppingListState;
  servings?: number;
  /** For variants: how many portions a swapped part takes from the dish. */
  profiles?: readonly Profile[];
  /** Stored retail offers; items without a planned offer get the best current one from these stores. */
  offers?: readonly RetailOffer[];
  stores?: readonly GroceryStore[];
  /** The day offers must be running on (normally today); defaults to `from`. */
  asOf?: string;
};

export type ShoppingList = {
  listId: string;
  from: string;
  to: string;
  items: ShoppingListItem[];
  excludedCount: number;
  totalEstimatedPrice: number;
  offerItemCount: number;
  checkedCount: number;
  /** Store comparison from the stored offers; only when offers were given. */
  basket?: BasketComparison;
};

export const EMPTY_SHOPPING_STATE: ShoppingListState = { checked: [], extras: [] };

export const extraItemId = (label: string): string => `extra:${normalizeItem(label)}`;

export function createShoppingList(input: ShoppingListInput): ShoppingList {
  const { listId, from, to, meals, dishes, pantry, servings } = input;
  const state = input.state ?? EMPTY_SHOPPING_STATE;
  const fridgeNames = input.fridge.map((item) => item.name);
  const days = daysInRange(from, to);
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
  const ingredients = new Map<string, AggregatedItem>();
  const replacements = new Map<string, { label: string; portions: number; dishNames: string[] }>();
  let excludedCount = 0;

  for (const day of days) {
    const meal = meals[day];
    if (!meal || meal.skipped) continue;
    const dish = dishById.get(meal.dishId);
    if (!dish) continue;

    const scaled = servings
      ? scaleIngredients(dish.ingredients, servings, baseServings(dish.servings))
      : dish.ingredients;
    // A variant takes its portions out of the swapped part and adds the replacement instead.
    const total = servings ?? baseServings(dish.servings);
    const variants = meal.variants ?? [];
    for (const variant of variants) {
      const key = normalizeItem(variant.with);
      const entry = replacements.get(key) ?? { label: variant.with, portions: 0, dishNames: [] };
      entry.portions += variantPortions(variant, input.profiles ?? []);
      if (!entry.dishNames.includes(dish.name)) entry.dishNames.push(dish.name);
      replacements.set(key, entry);
    }
    for (const ingredient of scaled) {
      const sourceLabel = ingredient.trim();
      if (!sourceLabel) continue;
      const parsed = parseIngredient(sourceLabel);
      const swapped = variants
        .filter((variant) => ingredientsMatch(parsed.name, variant.replaces))
        .reduce((sum, variant) => sum + variantPortions(variant, input.profiles ?? []), 0);
      if (swapped > 0 && parsed.amount !== undefined) {
        const share = Math.max(0, total - swapped) / total;
        if (share === 0) continue;
        parsed.amount *= share;
      }
      const matchingOffer = meal.offer && ingredientsMatch(parsed.name, meal.offer.item)
        ? meal.offer
        : undefined;
      if (
        fridgeNames.some((name) => ingredientsMatch(parsed.name, name)) ||
        pantry.some((staple) => ingredientsMatch(parsed.name, staple))
      ) {
        excludedCount += 1;
        continue;
      }
      const id = `ingredient:${normalizeItem(parsed.name)}:${parsed.unit ?? "unknown"}`;
      const existing = ingredients.get(id);
      if (existing) {
        if (existing.amount !== undefined && parsed.amount !== undefined) {
          existing.amount += parsed.amount;
          existing.quantityLabel = formatQuantity(existing.amount, existing.unit);
        }
        if (!existing.dishNames.includes(dish.name)) existing.dishNames.push(dish.name);
        if (!existing.offer && matchingOffer) existing.offer = matchingOffer;
      } else {
        ingredients.set(id, {
          id,
          label: parsed.name,
          quantityLabel: formatQuantity(parsed.amount, parsed.unit),
          sourceLabel,
          amount: parsed.amount,
          unit: parsed.unit,
          dishNames: [dish.name],
          extra: false,
          category: categorizeIngredient(parsed.name),
          offer: matchingOffer,
        });
      }
    }
  }

  for (const [key, entry] of replacements) {
    const id = `variant:${key}`;
    const portions = Math.round(entry.portions * 10) / 10;
    ingredients.set(id, {
      id,
      label: entry.label,
      quantityLabel: `${String(portions).replace(".", ",")} ${portions === 1 ? "portion" : "portioner"}`,
      sourceLabel: entry.label,
      dishNames: entry.dishNames,
      extra: false,
      category: categorizeIngredient(entry.label),
    });
  }

  const checked = new Set(state.checked);
  const asOf = input.asOf ?? from;
  const stores = input.stores ?? [];
  const retailOffer = (name: string) => (input.offers?.length ? bestOffer(name, input.offers, stores, asOf) : undefined);
  const withOffer = (item: AggregatedItem): AggregatedItem => (item.offer ? item : { ...item, offer: retailOffer(item.label) });
  const planned = [...ingredients.values()]
    .sort((a, b) => a.label.localeCompare(b.label, "da-DK"))
    .map((item) => priced(withOffer(item), checked));
  const availableOffers = days.flatMap((day) => {
    const offer = meals[day]?.offer;
    return offer ? [offer] : [];
  });
  const manual = state.extras
    .map((extra) => extra.label.trim())
    .filter(Boolean)
    .map((sourceLabel) => {
      const parsed = parseIngredient(sourceLabel);
      return priced(
        {
          id: extraItemId(sourceLabel),
          label: parsed.name,
          quantityLabel: formatQuantity(parsed.amount, parsed.unit),
          sourceLabel,
          amount: parsed.amount,
          unit: parsed.unit,
          dishNames: [],
          extra: true,
          category: categorizeIngredient(parsed.name),
          offer: availableOffers.find((offer) => ingredientsMatch(parsed.name, offer.item)) ?? retailOffer(parsed.name),
        },
        checked,
      );
    });

  const items = [...planned, ...manual];
  const basket = input.offers?.length && stores.length > 0
    ? compareBaskets(items.filter((item) => !item.checked), offerResult(items.map((item) => item.label), input.offers, stores, asOf), stores)
    : undefined;
  return {
    listId,
    from,
    to,
    items,
    excludedCount,
    totalEstimatedPrice: items.reduce((total, item) => total + item.estimatedPrice, 0),
    offerItemCount: items.filter((item) => item.priceIsOffer).length,
    checkedCount: items.filter((item) => item.checked).length,
    ...(basket ? { basket } : {}),
  };
}

function priced(source: AggregatedItem, checked: ReadonlySet<string>): ShoppingListItem {
  // The list shows (and prices) what you actually buy: whole cans, 50 g steps, and so on.
  const bought =
    source.amount !== undefined && source.unit !== undefined
      ? roundUpForPurchase(source.amount, source.unit)
      : source.amount;
  const item: AggregatedItem =
    bought !== undefined && bought !== source.amount
      ? { ...source, amount: bought, quantityLabel: formatQuantity(bought, source.unit) }
      : source;
  let estimatedPrice = estimateItemPrice(item);
  const offerPrice = item.offer?.price ? parseOfferPrice(item.offer.price) : undefined;
  const priceIsOffer = item.offer?.price !== undefined;
  if (offerPrice !== undefined) estimatedPrice = offerPrice;

  return {
    id: item.id,
    label: item.label,
    quantityLabel: item.quantityLabel,
    estimatedPrice,
    priceLabel: priceIsOffer
      ? `${item.offer?.price} · ${item.offer?.store}`
      : `ca. ${formatPrice(estimatedPrice)}`,
    priceIsOffer,
    offer: item.offer,
    sourceLabel: item.sourceLabel,
    dishNames: item.dishNames,
    extra: item.extra,
    category: item.category,
    checked: checked.has(item.id),
  };
}

// --- Pure state reducers for the persisted checked/extra state of a list --------------------------

export function toggleChecked(state: ShoppingListState, itemId: string): ShoppingListState {
  return {
    ...state,
    checked: state.checked.includes(itemId)
      ? state.checked.filter((candidate) => candidate !== itemId)
      : [...state.checked, itemId],
  };
}

/** Adds a free-text extra; blank or case-insensitive duplicates are ignored. */
export function addExtra(state: ShoppingListState, label: string): ShoppingListState {
  const clean = label.trim();
  if (!clean) return state;
  const exists = state.extras.some(
    (extra) => extra.label.toLocaleLowerCase("da-DK") === clean.toLocaleLowerCase("da-DK"),
  );
  return exists ? state : { ...state, extras: [...state.extras, { label: clean }] };
}

export function removeExtra(state: ShoppingListState, label: string): ShoppingListState {
  const id = extraItemId(label);
  return {
    checked: state.checked.filter((candidate) => candidate !== id),
    extras: state.extras.filter((extra) => extra.label !== label),
  };
}

export function clearChecked(state: ShoppingListState): ShoppingListState {
  return { ...state, checked: [] };
}
