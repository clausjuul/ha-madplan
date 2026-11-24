import { baseServings, scaleIngredientsForDisplay, type Dish } from "@madplan/domain";

export type IngredientLine = { amount: string; name: string };

const LINE =
  /^((?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?[¼½¾]?|[¼½¾])(?:\s*(?:kg|kilo|gram|gr\.?|g|liter|l|dl|cl|ml|stk\.?|dåser?|glas|pakker?|pk\.?|flasker?|spiseskeer?|spsk\.?|teskeer?|tsk\.?|fed|bundter?|bundt|potter?|potte)(?=\s|$))?)\s+(.+)$/iu;

/** Splits "500 g hakket oksekød" into a quantity column and a name; free text keeps an empty quantity. */
export function splitIngredient(text: string): IngredientLine {
  const match = LINE.exec(text.trim());
  return match ? { amount: match[1] ?? "", name: match[2] ?? "" } : { amount: "", name: text.trim() };
}

/** Ingredients for the chosen servings, written with friendly fractions (¾ løg, 1½ dåse). */
export function scaledLines(dish: Pick<Dish, "ingredients" | "servings">, servings: number): IngredientLine[] {
  return scaleIngredientsForDisplay(dish.ingredients, servings, baseServings(dish.servings)).map(splitIngredient);
}

/** Servings step used by the +/- control (whole persons, 1..30). */
export const clampServings = (value: number): number => Math.min(30, Math.max(1, Math.round(value)));

/** Words in an ingredient name that say how it is prepared or bought, not what it is. */
const NOT_THE_ITEM = new Set([
  "alm", "almindelig", "almindelige", "hakket", "hakkede", "finthakket", "finthakkede", "grofthakket", "revet", "revne",
  "frisk", "friske", "friskhakket", "tørret", "tørrede", "fransk", "franske", "store", "stor", "små", "lille", "mellemstore",
  "skrællede", "skåret", "skiver", "terninger", "tynde", "fint", "groft", "gerne", "eller", "evt", "efter", "smag", "til",
  "og", "af", "med", "fra", "fx", "kogte", "kogt", "rå", "fedtreducerede", "økologisk", "økologiske", "dåse", "pakke",
]);

const words = (text: string): string[] =>
  text
    .toLocaleLowerCase("da-DK")
    .split(/[^a-zæøå0-9]+/u)
    .filter(Boolean);

/** The words that name the item itself: "hakket oksekød (fx 8-12 %)" → ["oksekød"]. */
function itemWords(name: string): string[] {
  const bare = name.replace(/\([^)]*\)/gu, " ").split(/,| eller /u)[0] ?? "";
  return words(bare).filter((word) => word.length >= 3 && !NOT_THE_ITEM.has(word) && !/^\d/u.test(word));
}

/** A step word names the item: "løget", "kartoflerne", "fløden" all count for løg, kartofler, fløde. */
const mentions = (stepWord: string, item: string): boolean =>
  stepWord === item ||
  (stepWord.startsWith(item) && stepWord.length - item.length <= 4) ||
  (item.length >= 6 && item.startsWith(stepWord) && item.length - stepWord.length <= 2);

/**
 * The ingredient lines a step uses, in recipe order, so a phone can show "400 g oksekød" under the
 * step without opening the ingredient list. Matching is by the item's own words, never guessed.
 */
export function ingredientsForStep(step: string, lines: readonly IngredientLine[]): IngredientLine[] {
  const stepWords = words(step);
  return lines.filter((line) => {
    const item = itemWords(line.name);
    return item.length > 0 && item.some((word) => stepWords.some((stepWord) => mentions(stepWord, word)));
  });
}
