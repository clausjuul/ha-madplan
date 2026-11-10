import { daysBetween, type Dish } from "@madplan/domain";

export type SortKey = "name" | "recent" | "quick";

export const SORT_LABELS: Record<SortKey, string> = {
  name: "A–Å",
  recent: "Sidst spist",
  quick: "Hurtigst",
};

const fold = (value: string): string => value.toLocaleLowerCase("da-DK");

/** Case-insensitive match on name, category and ingredients. */
export function matchesQuery(dish: Dish, query: string): boolean {
  const needle = fold(query.trim());
  if (!needle) return true;
  return [dish.name, dish.category, ...dish.ingredients].some((part) => fold(part).includes(needle));
}

export function filterDishes(dishes: readonly Dish[], query: string, category: string | null): Dish[] {
  return dishes.filter(
    (dish) => (!category || dish.category === category) && matchesQuery(dish, query),
  );
}

const byName = (a: Dish, b: Dish): number => a.name.localeCompare(b.name, "da-DK");

export function sortDishes(
  dishes: readonly Dish[],
  sort: SortKey,
  lastEaten: ReadonlyMap<string, string>,
): Dish[] {
  const copy = [...dishes];
  if (sort === "quick") return copy.sort((a, b) => a.prepMinutes - b.prepMinutes || byName(a, b));
  if (sort === "recent") {
    return copy.sort((a, b) => {
      const left = lastEaten.get(a.id);
      const right = lastEaten.get(b.id);
      if (left && right) return right.localeCompare(left) || byName(a, b);
      if (left) return -1;
      if (right) return 1;
      return byName(a, b);
    });
  }
  return copy.sort(byName);
}

/** Distinct categories, alphabetically. */
export function categoriesOf(dishes: readonly Dish[]): string[] {
  return [...new Set(dishes.map((dish) => dish.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "da-DK"),
  );
}

/** "1 gang" / "2 gange": Danish count with singular or plural noun. */
export const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** "Spist i går", "Spist for 3 uger siden" or "Ikke prøvet". */
export function lastEatenLabel(date: string | undefined, today: string): string {
  if (!date) return "Ikke prøvet";
  const days = Math.max(0, daysBetween(date, today));
  if (days === 0) return "Spist i dag";
  if (days === 1) return "Spist i går";
  if (days < 14) return `Spist for ${days} dage siden`;
  if (days < 60) return `Spist for ${Math.round(days / 7)} uger siden`;
  return `Spist for ${Math.round(days / 30)} mdr. siden`;
}
