import type { Dish, MealMap } from "./types.ts";

export type EatenEntry = { date: string; dishId: string };

/**
 * History is derived, not stored: a meal on a date before `today` that is not skipped counts as eaten.
 * Newest first.
 */
export function eatenHistory(meals: MealMap, today: string): EatenEntry[] {
  return Object.entries(meals)
    .filter(([date, meal]) => date < today && !meal.skipped)
    .map(([date, meal]) => ({ date, dishId: meal.dishId }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function lastEatenByDish(eaten: readonly EatenEntry[]): Map<string, string> {
  const last = new Map<string, string>();
  for (const entry of eaten) {
    const current = last.get(entry.dishId);
    if (!current || entry.date > current) last.set(entry.dishId, entry.date);
  }
  return last;
}

export type DishHistoryStat = {
  dish: Dish;
  count: number;
  lastDate?: string;
};

export type HistoryInsights = {
  byDishId: Map<string, DishHistoryStat>;
  lastEatenByDish: Map<string, string>;
  mostEaten: DishHistoryStat[];
  longestSince: DishHistoryStat[];
  neverTried: DishHistoryStat[];
};

export function createHistoryInsights(
  meals: MealMap,
  dishes: readonly Dish[],
  today: string,
  limit = 5,
): HistoryInsights {
  const eaten = eatenHistory(meals, today);
  const byDishId = new Map<string, DishHistoryStat>(
    dishes.map((dish) => [dish.id, { dish, count: 0 }]),
  );
  for (const entry of eaten) {
    const stat = byDishId.get(entry.dishId);
    if (!stat) continue;
    stat.count += 1;
    if (!stat.lastDate || entry.date > stat.lastDate) stat.lastDate = entry.date;
  }

  const all = [...byDishId.values()];
  const tried = all.filter((stat) => stat.count > 0);
  return {
    byDishId,
    lastEatenByDish: lastEatenByDish(eaten),
    mostEaten: [...tried]
      .sort(
        (a, b) =>
          b.count - a.count || (b.lastDate ?? "").localeCompare(a.lastDate ?? ""),
      )
      .slice(0, limit),
    longestSince: [...tried]
      .sort((a, b) => (a.lastDate ?? "").localeCompare(b.lastDate ?? ""))
      .slice(0, limit),
    neverTried: all
      .filter((stat) => stat.count === 0 && !stat.dish.archivedAt)
      .slice(0, limit),
  };
}

/** The family has never eaten this dish (it can still be an old library dish). */
export function isUntried(dishId: string, lastEaten: ReadonlyMap<string, string>): boolean {
  return !lastEaten.has(dishId);
}

/**
 * A "new dish" is one the planner created: it was not in the library before and carries `generated`.
 * It stops being new once the family has eaten it. A library dish nobody has eaten is merely untried.
 */
export function isNewDish(dish: Pick<Dish, "id" | "generated">, lastEaten: ReadonlyMap<string, string>): boolean {
  return dish.generated === true && isUntried(dish.id, lastEaten);
}
