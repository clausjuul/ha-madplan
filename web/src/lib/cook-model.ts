import { baseServings, scaleIngredientsForDisplay, type Dish } from "@madplan/domain";

export type IngredientLine = { amount: string; name: string };

const LINE =
  /^((?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?[¼½¾]?|[¼½¾])(?:\s*(?:kg|g|liter|l|dl|cl|ml|stk\.?|dåser?|glas|pakker?|pk\.?|flasker?|spsk\.?|tsk\.?|fed|bundter?|bundt|potter?|potte)(?=\s|$))?)\s+(.+)$/iu;

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
