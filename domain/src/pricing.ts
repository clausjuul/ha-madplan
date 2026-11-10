import { normalizeItem } from "./ingredients.ts";
import type { IngredientUnit, ShoppingCategory } from "./ingredients.ts";

type PriceReference = {
  matches: RegExp;
  price: number;
  packageAmount?: number;
  unit?: IngredientUnit;
};

/** Rough Danish supermarket reference prices (kr. per package). Estimates only, never shown as verified prices. */
const PRICE_REFERENCES: readonly PriceReference[] = [
  { matches: /hakket oksekød|oksekød/u, price: 45, packageAmount: 500, unit: "g" },
  { matches: /kylling/u, price: 55, packageAmount: 1000, unit: "g" },
  { matches: /svinekød|mørbrad|flæsk/u, price: 42, packageAmount: 500, unit: "g" },
  { matches: /bacon/u, price: 20, packageAmount: 200, unit: "g" },
  { matches: /laks/u, price: 55, packageAmount: 400, unit: "g" },
  { matches: /fiskefrikad/u, price: 28, packageAmount: 4, unit: "count" },
  { matches: /kebab/u, price: 38, packageAmount: 400, unit: "g" },
  { matches: /pølse/u, price: 30, packageAmount: 8, unit: "count" },
  { matches: /parmesan/u, price: 28, packageAmount: 150, unit: "g" },
  { matches: /mozzarella|cheddar|feta|\bost\b/u, price: 28, packageAmount: 300, unit: "g" },
  { matches: /creme fraiche|fløde/u, price: 18, packageAmount: 500, unit: "ml" },
  { matches: /mælk/u, price: 14, packageAmount: 1000, unit: "ml" },
  { matches: /smør/u, price: 24, packageAmount: 200, unit: "g" },
  { matches: /\bæg\b/u, price: 28, packageAmount: 10, unit: "count" },
  { matches: /hakkede tomater/u, price: 10, packageAmount: 1, unit: "can" },
  { matches: /kidneybønner|majs/u, price: 11, packageAmount: 1, unit: "can" },
  { matches: /kokosmælk/u, price: 16, packageAmount: 1, unit: "can" },
  { matches: /lasagneplad/u, price: 18, packageAmount: 500, unit: "g" },
  { matches: /pasta|spaghetti|nudler/u, price: 15, packageAmount: 500, unit: "g" },
  { matches: /\bris\b/u, price: 20, packageAmount: 1000, unit: "g" },
  { matches: /tortilla|tacoskal/u, price: 18, packageAmount: 8, unit: "count" },
  { matches: /pitabrød|burgerbolle|hotdogbrød/u, price: 18, packageAmount: 6, unit: "count" },
  { matches: /rugbrød/u, price: 22 },
  { matches: /kartoff/u, price: 22, packageAmount: 2000, unit: "g" },
  { matches: /guler/u, price: 14, packageAmount: 1000, unit: "g" },
  { matches: /tomat/u, price: 20, packageAmount: 6, unit: "count" },
  { matches: /løg/u, price: 12, packageAmount: 1000, unit: "g" },
  { matches: /broccoli|blomkål/u, price: 17, packageAmount: 1, unit: "count" },
  { matches: /peberfrugt/u, price: 22, packageAmount: 3, unit: "count" },
  { matches: /salat/u, price: 16, packageAmount: 1, unit: "count" },
  { matches: /agurk/u, price: 12, packageAmount: 1, unit: "count" },
  { matches: /champignon/u, price: 18, packageAmount: 250, unit: "g" },
  { matches: /citron|lime/u, price: 5, packageAmount: 1, unit: "count" },
  { matches: /porre/u, price: 15, packageAmount: 3, unit: "count" },
  { matches: /persille|basilikum/u, price: 13, packageAmount: 1, unit: "pot" },
  { matches: /karry|paprika|krydderi/u, price: 16 },
  { matches: /tomatsauce|pesto|dressing|remoulade|ketchup|sennep/u, price: 18 },
  { matches: /brun sovs|bouillon/u, price: 12 },
];

const CATEGORY_FALLBACK_PRICES: Record<ShoppingCategory, number> = {
  "Frugt og grønt": 15,
  "Kød og fisk": 40,
  Køl: 22,
  Brød: 20,
  Frost: 30,
  Kolonial: 18,
  Andet: 20,
};

/** Estimated price in kr. for the amount needed; packages are rounded up when the unit is known. */
export function estimateItemPrice(item: {
  label: string;
  category: ShoppingCategory;
  amount?: number;
  unit?: IngredientUnit;
}): number {
  const normalized = normalizeItem(item.label);
  const reference = PRICE_REFERENCES.find(({ matches }) => matches.test(normalized));
  if (
    reference?.packageAmount &&
    reference.unit === item.unit &&
    item.amount !== undefined
  ) {
    return Math.max(1, Math.ceil(item.amount / reference.packageAmount)) * reference.price;
  }
  return reference?.price ?? CATEGORY_FALLBACK_PRICES[item.category];
}

/** Reads "2 for 30", "12,95 kr." or a bare number from an offer price label. */
export function parseOfferPrice(value: string): number | undefined {
  const normalized = value.toLocaleLowerCase("da-DK").replace(",", ".");
  const forPrice = /\b\d+\s*(?:stk\.?\s*)?for\s*(\d+(?:\.\d+)?)/u.exec(normalized);
  const currencyPrice = /(\d+(?:\.\d+)?)\s*(?:kr\.?|,-)/u.exec(normalized);
  const match = forPrice ?? currencyPrice ?? /(\d+(?:\.\d+)?)/u.exec(normalized);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : undefined;
}

export function formatPrice(value: number): string {
  return `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(value)} kr.`;
}
