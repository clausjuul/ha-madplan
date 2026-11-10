/** Deterministic interpretation of plan requests. An LLM never decides that a preserved day may be overwritten. */
import { isDateKey, parseDateKey } from "./dates.ts";
import type { Dish, FridgeItem } from "./types.ts";

const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"] as const;

export type ExistingDay = { date: string; locked: boolean };

/**
 * Days named in a "behold ..." instruction ("Behold lasagnen om tirsdagen") that already have a meal.
 * "behold låste dage" together with "resten"/"øvrige" preserves all locked days.
 */
export function preservedDaysFromRequest(
  request: string,
  dates: readonly string[],
  existing: readonly ExistingDay[],
): string[] {
  const text = request.toLocaleLowerCase("da-DK");
  const preserving = /\b(behold|bibehold|lad .* (?:være|stå)|ændr ikke|rør ikke|gem .* som den er)\b/u.test(
    text,
  );
  if (!preserving) return [];
  const existingDates = new Set(existing.map((item) => item.date));
  const days = new Set<string>();
  for (const date of dates) {
    if (!isDateKey(date) || !existingDates.has(date)) continue;
    const weekday = WEEKDAYS[parseDateKey(date).getDay()];
    if (weekday && new RegExp(`\\b${weekday}(?:en|s)?\\b`, "u").test(text)) days.add(date);
  }
  if (
    /\b(resten|øvrige)\b/u.test(text) &&
    /\b(behold (?:alle )?(?:låste|faste) (?:dage|retter))\b/u.test(text)
  ) {
    for (const item of existing) if (item.locked && dates.includes(item.date)) days.add(item.date);
  }
  return [...days];
}

export type PlanningOptions = {
  budgetDkk: number | null;
  maxPrepMinutes: number | null;
  /** The request asks for a cheaper plan ("billig", "spar" ...). */
  economical: boolean;
};

export function normalizePlanningOptions(options: {
  budgetDkk?: number | null;
  maxPrepMinutes?: number | null;
  request?: string;
}): PlanningOptions {
  const budget = Number(options.budgetDkk ?? Number.NaN);
  const maxPrep = Number(options.maxPrepMinutes ?? Number.NaN);
  return {
    budgetDkk: Number.isFinite(budget) && budget >= 50 && budget <= 5000 ? Math.round(budget) : null,
    maxPrepMinutes:
      Number.isFinite(maxPrep) && maxPrep >= 10 && maxPrep <= 240 ? Math.round(maxPrep) : null,
    economical: /\b(billig|billigere|budget|spar|økonomisk)\b/iu.test(options.request ?? ""),
  };
}

/**
 * Ranking hint, NOT a verified store price. Only used to choose between eligible
 * recipes, never shown as a numeric price.
 */
export function relativeRecipeCost(
  dish: Pick<Dish, "name" | "ingredients">,
  fridge: readonly (FridgeItem | string)[] = [],
): number {
  const text = [dish.name, ...dish.ingredients].join(" ").toLocaleLowerCase("da-DK");
  const expensive = /(oksemørbrad|mørbrad|entrecote|ribeye|rejer|laks|bøf|oksekød)/u.test(text) ? 4 : 0;
  const moderate = /(kylling|kød|fisk|bacon|parmesan)/u.test(text) ? 2 : 0;
  const cheaper = /(bønner|linser|kartofler|ris|pasta|æg|grøntsager)/u.test(text) ? -1 : 0;
  const pantry = dish.ingredients.filter((ingredient) =>
    fridgeNames(fridge).some(
      (name) => name.length >= 3 && ingredient.toLocaleLowerCase("da-DK").includes(name),
    ),
  ).length;
  return expensive + moderate + cheaper - pantry * 2;
}

/**
 * Lower-cased fridge names. Strings may carry a structured suffix such as "bønner (2 dåser, brug først)";
 * only the part before " (" is the name.
 */
export function fridgeNames(fridge: readonly (FridgeItem | string)[]): string[] {
  return fridge.map((item) =>
    (typeof item === "string" ? item.split(" (")[0] ?? "" : item.name)
      .trim()
      .toLocaleLowerCase("da-DK"),
  );
}
