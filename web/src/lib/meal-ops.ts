import type { Meal, MealInput, MealMap } from "@madplan/domain";

export const LOCKED_SWAP_MESSAGE =
  "Der er en låst dag med i bytningen. Lås den op først, hvis du vil flytte den.";

export type SwapCheck = { ok: true } | { ok: false; message: string };

/** Swaps involving a locked day are refused (the server answers 409 for the same case). */
export function canSwap(meals: MealMap, a: string, b: string): SwapCheck {
  if (a === b) return { ok: false, message: "Vælg en anden dag." };
  if (meals[a]?.locked || meals[b]?.locked) return { ok: false, message: LOCKED_SWAP_MESSAGE };
  if (!meals[a] && !meals[b]) return { ok: false, message: "Der er ingen retter at bytte." };
  return { ok: true };
}

/** Pure swap; an empty day simply receives the other day's meal (a move). */
export function swapMealsIn(meals: MealMap, a: string, b: string): MealMap {
  const next: MealMap = { ...meals };
  const first = meals[a];
  const second = meals[b];
  if (second) next[a] = second;
  else delete next[a];
  if (first) next[b] = first;
  else delete next[b];
  return next;
}

export function mealFromInput(input: MealInput): Meal {
  return {
    dishId: input.dishId,
    locked: input.locked ?? false,
    note: input.note ?? "",
    source: input.source ?? "manual",
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.offer ? { offer: input.offer } : {}),
    ...(input.skipped ? { skipped: true } : {}),
  };
}

export function removeMealFrom(meals: MealMap, date: string): MealMap {
  const next = { ...meals };
  delete next[date];
  return next;
}

export function patchMealIn(meals: MealMap, date: string, patch: Partial<MealInput>): MealMap {
  const current = meals[date];
  if (!current) return meals;
  const { rating, variants, ...rest } = patch;
  const next = { ...current, ...rest };
  if (rating === null) delete next.rating;
  else if (rating !== undefined) next.rating = rating;
  if (variants?.length) next.variants = variants;
  else if (variants === null || (variants !== undefined && !variants.length)) delete next.variants;
  else if (rest.dishId !== undefined && rest.dishId !== current.dishId) delete next.variants;
  return { ...meals, [date]: next };
}
