/** Base recipe quantities use four portions unless the recipe explicitly sets servings. */
export function baseServings(servings?: number): number {
  return servings !== undefined &&
    Number.isInteger(servings) &&
    servings >= 1 &&
    servings <= 30
    ? servings
    : 4;
}

export function targetServings(householdCount: number, override?: number): number {
  if (override !== undefined && Number.isFinite(override) && override >= 0.5 && override <= 30) {
    return override;
  }
  return householdCount >= 1 && householdCount <= 30 ? householdCount : 4;
}

const FRACTION = /^(\d+)\s*\/\s*(\d+)$/u;

function parseAmount(raw: string): number {
  const fraction = FRACTION.exec(raw);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator ? Number(fraction[1]) / denominator : Number.NaN;
  }
  return Number(raw.replace(",", "."));
}

export function scaleIngredient(ingredient: string, servings: number, base = 4): string {
  if (
    !Number.isFinite(servings) ||
    servings < 0.5 ||
    servings > 30 ||
    !Number.isInteger(base) ||
    base < 1 ||
    base > 30
  ) {
    return ingredient;
  }
  if (servings === base) return ingredient;
  // Only scale explicit numerical quantities; preserve text like "salt efter smag".
  const match = /^(\s*)(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)(\s+)(.+)$/u.exec(ingredient);
  if (!match) return ingredient;
  const [, lead = "", rawAmount = "", gap = " ", rest = ""] = match;
  const amount = parseAmount(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return ingredient;
  const scaled = Math.round(((amount * servings) / base) * 100) / 100;
  // No digit grouping: "1.000 g" would be re-read as 1 g by the ingredient parser.
  const formatted = new Intl.NumberFormat("da-DK", {
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(scaled);
  return lead + formatted + gap + rest;
}

export function scaleIngredients(
  ingredients: readonly string[],
  servings: number,
  base = 4,
): string[] {
  return ingredients.map((ingredient) => scaleIngredient(ingredient, servings, base));
}
