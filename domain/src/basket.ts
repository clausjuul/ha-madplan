import type { ShoppingListItem } from "./shopping.ts";
import type { GroceryStore, RetailOffer, RetailOfferResult } from "./types.ts";

type PackUnit = "g" | "ml" | "count" | "can" | "package" | "bottle";
type Amount = { amount: number; unit: PackUnit };

const num = (value: string): number => Number(value.replace(",", "."));

function quantity(text: string): Amount | null {
  const normalized = text.toLocaleLowerCase("da-DK").trim();
  const multipack =
    /(?:^|\s)(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|liter|l|dl|cl|ml)\b/u.exec(normalized);
  const single =
    /(?:^|[^\d])([\d]+(?:[.,]\d+)?)\s*(kg|g|liter|l|dl|cl|ml|stk\.?|dåser?|pakker?|flasker?)\b/u.exec(
      normalized,
    );
  let found: { amount: number; unit: string } | null = null;
  if (multipack) {
    found = { amount: num(multipack[1] ?? "") * num(multipack[2] ?? ""), unit: multipack[3] ?? "" };
  } else if (single) {
    found = { amount: num(single[1] ?? ""), unit: single[2] ?? "" };
  }
  if (!found || !Number.isFinite(found.amount) || found.amount <= 0) return null;
  const { amount, unit } = found;
  if (unit === "kg") return { amount: amount * 1000, unit: "g" };
  if (unit === "g") return { amount, unit: "g" };
  if (unit === "liter" || unit === "l") return { amount: amount * 1000, unit: "ml" };
  if (unit === "dl") return { amount: amount * 100, unit: "ml" };
  if (unit === "cl") return { amount: amount * 10, unit: "ml" };
  if (unit === "ml") return { amount, unit: "ml" };
  if (unit.startsWith("dås")) return { amount, unit: "can" };
  if (unit.startsWith("pakk")) return { amount, unit: "package" };
  if (unit.startsWith("flask")) return { amount, unit: "bottle" };
  return { amount, unit: "count" };
}

// Prefer the structured pack field. Never price an unknown package.
const offerPack = (offer: RetailOffer): Amount | null =>
  quantity(offer.quantityLabel) ?? quantity(offer.name);

const isDay = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/u.test(value);

function isConfirmedCurrentOffer(offer: RetailOffer, asOf: string): boolean {
  return (
    offer.confirmed === true &&
    offer.source === "Prej" &&
    isDay(asOf) &&
    isDay(offer.observed) &&
    offer.observed <= asOf &&
    isDay(offer.validUntil) &&
    offer.validUntil >= asOf &&
    (offer.validFrom === null || (isDay(offer.validFrom) && offer.validFrom <= asOf))
  );
}

export type BasketLine = {
  name: string;
  quantity: string;
  packages: number;
  subtotalOre: number;
  product: string;
};

export type StoreBasket = {
  store: GroceryStore;
  knownOre: number;
  coveredCount: number;
  missingCount: number;
  lines: BasketLine[];
};

export type BasketComparison = {
  stores: StoreBasket[];
  commonCount: number;
  commonTotals: { store: GroceryStore; totalOre: number }[];
  fullComparisonAvailable: boolean;
};

type BasketItem = Pick<ShoppingListItem, "id" | "label" | "quantityLabel" | "extra">;
type PricedRow = { packages: number; subtotalOre: number; product: string };

/** Only counts offers when the required amount and the pack amount share a known unit. */
export function compareBaskets(
  items: readonly BasketItem[],
  result: RetailOfferResult,
  stores: readonly GroceryStore[],
): BasketComparison {
  const wanted = items.filter((item) => !item.extra);
  const byIngredient = new Map(
    result.offers.map((group) => [group.ingredient.toLocaleLowerCase("da-DK"), group.matches]),
  );
  const matchedByStore = new Map<GroceryStore, Map<string, PricedRow>>();
  for (const store of stores) {
    const priced = new Map<string, PricedRow>();
    for (const item of wanted) {
      const required = quantity(item.quantityLabel);
      if (!required) continue;
      const offers = (byIngredient.get(item.label.toLocaleLowerCase("da-DK")) ?? []).filter(
        (offer) => offer.chain === store && isConfirmedCurrentOffer(offer, result.asOf),
      );
      const candidates = offers
        .flatMap((offer) => {
          const pack = offerPack(offer);
          if (
            !pack ||
            pack.unit !== required.unit ||
            !Number.isInteger(offer.amountOre) ||
            offer.amountOre <= 0
          ) {
            return [];
          }
          const packages = Math.ceil(required.amount / pack.amount);
          if (packages < 1 || packages > 200) return [];
          return [{ packages, subtotalOre: packages * offer.amountOre, product: offer.name }];
        })
        .sort((a, b) => a.subtotalOre - b.subtotalOre);
      const best = candidates[0];
      if (best) priced.set(item.id, best);
    }
    matchedByStore.set(store, priced);
  }

  const storesResult = stores.map((store): StoreBasket => {
    const priced = matchedByStore.get(store) ?? new Map<string, PricedRow>();
    return {
      store,
      knownOre: [...priced.values()].reduce((sum, row) => sum + row.subtotalOre, 0),
      coveredCount: priced.size,
      missingCount: wanted.length - priced.size,
      lines: wanted.flatMap((item) => {
        const row = priced.get(item.id);
        return row ? [{ name: item.label, quantity: item.quantityLabel, ...row }] : [];
      }),
    };
  });
  const common = wanted.filter((item) =>
    stores.every((store) => matchedByStore.get(store)?.has(item.id)),
  );
  return {
    stores: storesResult,
    commonCount: common.length,
    commonTotals: stores.map((store) => ({
      store,
      totalOre: common.reduce(
        (sum, item) => sum + (matchedByStore.get(store)?.get(item.id)?.subtotalOre ?? 0),
        0,
      ),
    })),
    fullComparisonAvailable:
      common.length === wanted.length && wanted.length > 0 && stores.length >= 2,
  };
}
