/**
 * Display scaling for recipes / cooking mode: friendly fractions, not a shopping quantity
 * (shopping lists round UP to purchasable amounts instead, see roundUpForPurchase).
 */

const UNIT_WORD =
  /^(kg|g|liter|l|dl|cl|ml|stk\.?|dåser?|glas|pakker?|pk\.?|flasker?|spsk\.?|tsk\.?|fed|bundter?|bundt|potter?|potte)(?=\s|$)\s*(.*)$/iu;
const PLURAL_UNITS: Record<string, [string, string]> = {
  dåse: ["dåse", "dåser"],
  pakke: ["pakke", "pakker"],
  flaske: ["flaske", "flasker"],
  bundt: ["bundt", "bundter"],
  potte: ["potte", "potter"],
};
const GLYPHS: Record<number, string> = { 0.25: "¼", 0.5: "½", 0.75: "¾" };

function parseAmount(raw: string): number {
  const fraction = /^(\d+)\s*\/\s*(\d+)$/u.exec(raw);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator ? Number(fraction[1]) / denominator : Number.NaN;
  }
  return Number(raw.replace(",", "."));
}

/** 1.5 -> "1½", 0.75 -> "¾", 2 -> "2". `value` must already be a multiple of 0.25. */
function formatFraction(value: number): string {
  const whole = Math.floor(value + 1e-9);
  const glyph = GLYPHS[Math.round((value - whole) * 100) / 100];
  if (!glyph) return String(whole);
  return whole === 0 ? glyph : `${whole}${glyph}`;
}

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;
const decimal = (value: number): string =>
  new Intl.NumberFormat("da-DK", { maximumFractionDigits: 2, useGrouping: false }).format(value);

/** Word for a countable unit that agrees with the amount ("1½ dåse", "2 dåser"); other units stay as written. */
function agreeUnit(unit: string, amount: number): string {
  const forms = PLURAL_UNITS[unit.toLocaleLowerCase("da-DK").replace(/r$/u, "")];
  return forms ? (amount < 2 ? forms[0] : forms[1]) : unit;
}

/**
 * Scales one ingredient line and writes it the way a cook reads it: ¼ ½ ¾ for countable things
 * (nearest quarter), whole/half spoons, tidy gram and millilitre steps. Lines without a leading number
 * (or with invalid servings) are returned unchanged.
 */
export function scaleIngredientForDisplay(ingredient: string, servings: number, base = 4): string {
  const match = /^(\s*)(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)(\s+)(.+)$/u.exec(ingredient);
  if (!match) return ingredient;
  const [, lead = "", rawAmount = "", gap = " ", rest = ""] = match;
  const valid =
    Number.isFinite(servings) && servings >= 0.5 && servings <= 30 && Number.isInteger(base) && base >= 1 && base <= 30;
  const amount = parseAmount(rawAmount);
  if (!valid || !Number.isFinite(amount) || amount <= 0) return ingredient;
  const scaled = (amount * servings) / base;

  const unitMatch = UNIT_WORD.exec(rest);
  const unit = unitMatch?.[1];
  const tail = unitMatch ? (unitMatch[2] ?? "") : rest;
  const lower = unit?.toLocaleLowerCase("da-DK");
  const join = (value: string, word: string | undefined): string =>
    `${lead}${value}${gap}${word ? `${word}${tail ? " " : ""}` : ""}${tail}`;

  if (lower === "g" || lower === "ml") {
    return join(decimal(Math.max(5, roundTo(scaled, scaled < 100 ? 5 : 10))), unit);
  }
  if (lower === "kg" || lower === "l" || lower === "liter") {
    return join(decimal(Math.max(0.05, roundTo(scaled, 0.05))), unit);
  }
  if (lower === "cl") return join(decimal(Math.max(0.5, roundTo(scaled, 0.5))), unit);
  if (lower?.startsWith("spsk") || lower?.startsWith("tsk")) {
    return join(formatFraction(Math.max(0.5, roundTo(scaled, 0.5))), unit);
  }
  const quarters = Math.max(0.25, roundTo(scaled, 0.25));
  const word = lower === "dl" ? unit : unit ? agreeUnit(unit, quarters) : undefined;
  return join(formatFraction(quarters), word);
}

export function scaleIngredientsForDisplay(
  ingredients: readonly string[],
  servings: number,
  base = 4,
): string[] {
  return ingredients.map((ingredient) => scaleIngredientForDisplay(ingredient, servings, base));
}
