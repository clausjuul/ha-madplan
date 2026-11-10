/** Ingredient parsing, quantity formatting, matching and shop-category helpers. */

export type IngredientUnit =
  | "g"
  | "ml"
  | "count"
  | "can"
  | "glass"
  | "package"
  | "bottle"
  | "tbsp"
  | "tsp"
  | "bunch"
  | "pot";

export type ShoppingCategory =
  | "Frugt og grønt"
  | "Kød og fisk"
  | "Køl"
  | "Brød"
  | "Frost"
  | "Kolonial"
  | "Andet";

export type ParsedIngredient = {
  name: string;
  amount?: number;
  unit?: IngredientUnit;
};

export function normalizeItem(value: string): string {
  return value
    .toLocaleLowerCase("da-DK")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Loose name matching used for fridge/pantry/offer matching; very short names only match exactly. */
export function ingredientsMatch(ingredient: string, other: string): boolean {
  const a = normalizeItem(ingredient);
  const b = normalizeItem(other);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4) return false;
  return a.includes(b) || b.includes(a);
}

const INGREDIENT_PATTERN =
  /^(\d+(?:[.,]\d+)?)\s*(kg|g|liter|l|dl|cl|ml|stk\.?|dåser?|glas|pakker?|flasker?|spsk\.?|tsk\.?|bundter?|potter?|fed|skiver?|knivspids(?:er)?|nip)?\s+(.+)$/iu;

/** Normalizes units: kg->g, l/dl/cl->ml. Anything without a leading number has no amount. */
export function parseIngredient(value: string): ParsedIngredient {
  const match = INGREDIENT_PATTERN.exec(value.trim());
  if (!match) return { name: value.trim() };

  const amount = Number((match[1] ?? "").replace(",", "."));
  if (!Number.isFinite(amount)) return { name: value.trim() };
  const rawUnit = match[2]?.toLocaleLowerCase("da-DK");
  const name = (match[3] ?? "").trim();
  if (!rawUnit || /^stk/u.test(rawUnit)) return { name, amount, unit: "count" };
  if (rawUnit === "kg") return { name, amount: amount * 1000, unit: "g" };
  if (rawUnit === "g") return { name, amount, unit: "g" };
  if (rawUnit === "l" || rawUnit === "liter") return { name, amount: amount * 1000, unit: "ml" };
  if (rawUnit === "dl") return { name, amount: amount * 100, unit: "ml" };
  if (rawUnit === "cl") return { name, amount: amount * 10, unit: "ml" };
  if (rawUnit === "ml") return { name, amount, unit: "ml" };
  if (/^dåse/u.test(rawUnit)) return { name, amount, unit: "can" };
  if (rawUnit === "glas") return { name, amount, unit: "glass" };
  if (/^pakke/u.test(rawUnit)) return { name, amount, unit: "package" };
  if (/^flaske/u.test(rawUnit)) return { name, amount, unit: "bottle" };
  if (/^spsk/u.test(rawUnit)) return { name, amount, unit: "tbsp" };
  if (/^tsk/u.test(rawUnit)) return { name, amount, unit: "tsp" };
  if (/^bundt/u.test(rawUnit)) return { name, amount, unit: "bunch" };
  if (/^potte/u.test(rawUnit)) return { name, amount, unit: "pot" };
  // Countable portions of an item ("2 fed hvidløg" is 2 hvidløg, not an item called "fed hvidløg").
  // Mapped to the count unit: quantities stay additive across recipes and round up to whole pieces.
  return { name, amount, unit: "count" };
}

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("da-DK", { maximumFractionDigits: 2 }).format(value);

const UNIT_LABELS: Record<Exclude<IngredientUnit, "g" | "ml" | "count">, [string, string]> = {
  can: ["dåse", "dåser"],
  glass: ["glas", "glas"],
  package: ["pakke", "pakker"],
  bottle: ["flaske", "flasker"],
  tbsp: ["spsk.", "spsk."],
  tsp: ["tsk.", "tsk."],
  bunch: ["bundt", "bundter"],
  pot: ["potte", "potter"],
};

export function formatQuantity(amount?: number, unit?: IngredientUnit): string {
  if (amount === undefined || unit === undefined) return "Mængde ikke angivet";
  if (unit === "g") {
    return amount >= 1000 ? `${formatNumber(amount / 1000)} kg` : `${formatNumber(amount)} g`;
  }
  if (unit === "ml") {
    if (amount >= 1000) return `${formatNumber(amount / 1000)} liter`;
    if (amount >= 100) return `${formatNumber(amount / 100)} dl`;
    return `${formatNumber(amount)} ml`;
  }
  if (unit === "count") return `${formatNumber(amount)} stk.`;
  const [singular, plural] = UNIT_LABELS[unit];
  return `${formatNumber(amount)} ${amount === 1 ? singular : plural}`;
}

const ceilTo = (value: number, step: number): number => Math.ceil(value / step - 1e-6) * step;

/**
 * Rounds an aggregated amount UP to something that can be bought: whole units for countable things,
 * 10 g (50 g above 100 g) for weights, 50 ml (100 ml from 500 ml) for volumes.
 */
export function roundUpForPurchase(amount: number, unit: IngredientUnit): number {
  if (!Number.isFinite(amount) || amount <= 0) return amount;
  switch (unit) {
    case "g":
      return amount <= 100 ? ceilTo(amount, 10) : ceilTo(amount, 50);
    case "ml":
      return amount < 500 ? ceilTo(amount, 50) : ceilTo(amount, 100);
    default:
      return Math.max(1, ceilTo(amount, 1));
  }
}

export function categorizeIngredient(value: string): ShoppingCategory {
  const item = normalizeItem(value);

  // Frost must be based on complete words. A loose `is$` match also catches
  // ordinary pantry items such as "ris".
  if (
    /(?:^|[\s-])(?:frost|frossen|frosne|dybfrossen|dybfrosne)(?:$|[\s-])/u.test(item) ||
    item === "is" ||
    item.startsWith("is ")
  ) {
    return "Frost";
  }
  // Tinned / processed tomato and coconut milk live on the shelf, not with the vegetables or the dairy.
  if (/(hakkede|flåede|soltørrede|knuste)\s+tomat|tomatpur|tomatpasta|tomatsauce|tomatsovs|kokosmælk|kokosmaelk/u.test(item)) {
    return "Kolonial";
  }
  if (
    /(kartof|tomat|løg|guler|broccoli|blomkål|peberfrugt|salat|majs|agurk|champignon|svamp|citron|lime|porre|persille|basilikum|spinat|kål|squash|courgette|aubergine|ærter|bønnespir|ingefær|æble|banan|pære|appelsin|avocado|frugt|grøntsag|bær|chili|dild|timian|rosmarin|koriander|mynte|salvie|rucola|radise|selleri|rødbede|pastinak|fennikel|asparges|mango|ananas|mandarin|vindrue|melon|hvidløg|grønt)/u.test(
      item,
    )
  ) {
    return "Frugt og grønt";
  }
  if (
    /(kylling|kalkun|oksekød|svinekød|mørbrad|bacon|skinke|pølse|kebab|laks|torsk|tun|rejer|fisk|flæsk|kød|frikadelle|medister|bøf|filet|schnitzel|krabbe|makrel|sild|\band\b|\blam)/u.test(
      item,
    )
  ) {
    return "Kød og fisk";
  }
  if (
    /(mælk|fløde|ost|parmesan|mozzarella|cheddar|feta|æg|smør|yoghurt|skyr|creme fraiche|pålæg)/u.test(
      item,
    )
  ) {
    return "Køl";
  }
  if (/(brød|bolle|pitabrød|tortilla|naan|bagel)/u.test(item)) return "Brød";
  if (
    /(pasta|spaghetti|lasagneplad|ris|nudler|couscous|bulgur|quinoa|bønner|linser|tomatsauce|karry|paprika|soja|dressing|remoulade|ketchup|sennep|pesto|sovs|bouillon|kokosmælk|mel|havre|sukker|olie|eddike|salt|peber|krydderi|dej|tacoskal)/u.test(
      item,
    )
  ) {
    return "Kolonial";
  }
  return "Andet";
}
