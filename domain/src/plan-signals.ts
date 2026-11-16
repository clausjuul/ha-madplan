/**
 * Extra planning signals derived from data we already have: the days around the plan, repeated
 * categories, the family's weekday rhythm and dishes recently swapped out of a draft ("Lav om").
 */
import { addDaysToKey, daysBetween, parseDateKey, weekdayName } from "./dates.ts";
import type { EatenEntry } from "./history.ts";
import type { Dish, MealMap } from "./types.ts";

// --- Neighbour days ----------------------------------------------------------------------------

/** A day around (or between) the open dates that already has a dish. */
export type NeighbourDay = {
  date: string;
  dishId: string;
  name: string;
  category: string;
  /** Locked or kept as it is; the planner cannot change it. */
  locked: boolean;
};

/**
 * The meals from `before` days ahead of the first open date to `after` days past the last one,
 * except the open dates themselves (they are being planned) and skipped days.
 */
export function neighbourDays(
  meals: MealMap,
  dishes: readonly Dish[],
  openDates: readonly string[],
  locked: ReadonlySet<string>,
  before = 7,
  after = 3,
): NeighbourDay[] {
  const sorted = [...openDates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return [];
  const open = new Set(sorted);
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
  const result: NeighbourDay[] = [];
  const end = addDaysToKey(last, after);
  for (let date = addDaysToKey(first, -before); date <= end; date = addDaysToKey(date, 1)) {
    const meal = meals[date];
    const dish = meal && !meal.skipped ? dishById.get(meal.dishId) : undefined;
    if (open.has(date) || !meal || !dish) continue;
    result.push({ date, dishId: dish.id, name: dish.name, category: dish.category, locked: locked.has(date) || meal.locked });
  }
  return result;
}

// --- Repeated categories -----------------------------------------------------------------------

/** Categories too vague to count as "the same dish type" (fixtures and custom dishes default to it). */
const VAGUE_CATEGORIES = new Set(["", "andet"]);

export type CategoryRepeat = { category: string; dates: string[] };

/** Runs of two or more consecutive calendar days with the same category, in date order. */
export function categoryRepeats(days: readonly { date: string; category: string }[]): CategoryRepeat[] {
  const byDate = new Map(days.map((day) => [day.date, day.category]));
  const sorted = [...byDate.keys()].sort();
  const runs: CategoryRepeat[] = [];
  let current: CategoryRepeat | undefined;
  for (const date of sorted) {
    const category = byDate.get(date) ?? "";
    const continues =
      current !== undefined &&
      current.category === category &&
      addDaysToKey(current.dates[current.dates.length - 1]!, 1) === date;
    if (continues) {
      current!.dates.push(date);
      continue;
    }
    if (current && current.dates.length > 1) runs.push(current);
    current = VAGUE_CATEGORIES.has(category.trim().toLocaleLowerCase("da-DK")) ? undefined : { category, dates: [date] };
  }
  if (current && current.dates.length > 1) runs.push(current);
  return runs;
}

/** Danish description of a run, e.g. "Kylling tre dage i træk (man., tir. og ons.)". */
export function describeRepeat(repeat: CategoryRepeat): string {
  const count = ["", "", "to", "tre", "fire", "fem", "seks", "syv"][repeat.dates.length] ?? String(repeat.dates.length);
  const names = repeat.dates.map((date) => weekdayName(date, "short"));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}` : names.join("");
  return `${repeat.category} ${count} dage i træk (${list})`;
}

/** Same category as a known day right before or after `date` (planned or neighbour). */
export function adjacentSameCategory(
  date: string,
  category: string,
  known: ReadonlyMap<string, string>,
): number {
  if (VAGUE_CATEGORIES.has(category.trim().toLocaleLowerCase("da-DK"))) return 0;
  return [addDaysToKey(date, -1), addDaysToKey(date, 1)].filter((day) => known.get(day) === category).length;
}

// --- Weekday rhythm ----------------------------------------------------------------------------

export type WeekdayRhythm = {
  /** 0 = Sunday … 6 = Saturday (Date#getDay). */
  weekday: number;
  /** Categories the family often has on this weekday, most frequent first. */
  oftenCategories: string[];
  /** Meals on this weekday usually take clearly longer than on other days. */
  takesLonger: boolean;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/**
 * Fixed patterns per weekday from the last `weeks` weeks of history ("fredag er ofte pizza",
 * "søndag tager gerne længere tid"). A weekday needs at least `minSamples` eaten meals to say anything.
 */
export function weekdayRhythm(
  eaten: readonly EatenEntry[],
  dishes: readonly Dish[],
  today: string,
  weeks = 12,
  minSamples = 3,
): WeekdayRhythm[] {
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
  const from = addDaysToKey(today, -weeks * 7);
  const recent = eaten.flatMap((entry) => {
    const dish = dishById.get(entry.dishId);
    return dish && entry.date >= from && entry.date < today ? [{ date: entry.date, dish }] : [];
  });
  const minutes = (dish: Dish): number | undefined => (Number.isFinite(dish.prepMinutes) ? dish.prepMinutes : undefined);
  const allMinutes = recent.flatMap(({ dish }) => minutes(dish) ?? []);
  const overall = allMinutes.length ? median(allMinutes) : 0;
  const result: WeekdayRhythm[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const day = recent.filter(({ date }) => parseDateKey(date).getDay() === weekday);
    if (day.length < minSamples) continue;
    const counts = new Map<string, number>();
    for (const { dish } of day) {
      if (VAGUE_CATEGORIES.has(dish.category.trim().toLocaleLowerCase("da-DK"))) continue;
      counts.set(dish.category, (counts.get(dish.category) ?? 0) + 1);
    }
    const threshold = Math.max(minSamples, Math.ceil(day.length * 0.4));
    const oftenCategories = [...counts]
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "da-DK"))
      .map(([category]) => category);
    const dayMinutes = day.flatMap(({ dish }) => minutes(dish) ?? []);
    const takesLonger = dayMinutes.length >= minSamples && median(dayMinutes) >= overall + 15;
    if (oftenCategories.length || takesLonger) result.push({ weekday, oftenCategories, takesLonger });
  }
  return result;
}

/** Soft bonus for a dish that fits the weekday's rhythm. */
export function rhythmScore(dish: Dish, date: string, rhythm: readonly WeekdayRhythm[]): number {
  const day = rhythm.find((entry) => entry.weekday === parseDateKey(date).getDay());
  if (!day) return 0;
  const minutes = Number.isFinite(dish.prepMinutes) ? dish.prepMinutes : 0;
  return (day.oftenCategories.includes(dish.category) ? 12 : 0) + (day.takesLonger && minutes >= 40 ? 6 : 0);
}

// --- Swapped out of a draft ("Lav om") ---------------------------------------------------------

/** A dish the family swapped out of a plan draft on `date`. */
export type SwapOut = { dishId: string; date: string };

export const SWAP_OUT_DAYS = 60;

/**
 * dishId -> soft minus for dishes recently swapped out of a draft. Each swap counts -8, fading to
 * nothing over SWAP_OUT_DAYS; the total is capped at -24 so a dish never disappears for good.
 */
export function swapOutScores(swaps: readonly SwapOut[], today: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const swap of swaps) {
    const age = Math.max(0, daysBetween(swap.date, today));
    if (age >= SWAP_OUT_DAYS) continue;
    totals.set(swap.dishId, (totals.get(swap.dishId) ?? 0) - 8 * (1 - age / SWAP_OUT_DAYS));
  }
  return new Map([...totals].map(([id, total]) => [id, Math.round(Math.max(-24, total))]));
}
