import {
  addDaysToKey,
  daysBetween,
  describeVariant,
  daysInRange,
  eatenHistory,
  isNewDish,
  isUntried,
  lastEatenByDish,
  parseDateKey,
  weekdayName,
  type Dish,
  type FridgeItem,
  type Meal,
  type MealMap,
  type Profile,
} from "@madplan/domain";

export type DayModel = {
  date: string;
  /** "Man 9." */
  shortLabel: string;
  /** "Mandag 10." */
  longLabel: string;
  meal: Meal | undefined;
  dish: Dish | undefined;
  isToday: boolean;
  isPast: boolean;
  /** Created by the planner and not eaten yet ("Ny ret"). */
  isNew: boolean;
  /** An older library dish nobody has eaten yet ("Ikke prøvet"). */
  isUntried: boolean;
  hasOffer: boolean;
  locked: boolean;
  meta: string;
  /** "Oliver: nuggets i stedet for bøf", one per variant. */
  variantLines: string[];
};

const capitalize = (value: string): string => value.charAt(0).toLocaleUpperCase("da-DK") + value.slice(1);
const plain = (value: string): string => value.replace(/\./gu, "");

export function dayLabels(date: string): { shortLabel: string; longLabel: string } {
  const day = parseDateKey(date).getDate();
  return {
    shortLabel: `${capitalize(plain(weekdayName(date, "short"))).slice(0, 3)} ${day}.`,
    longLabel: `${capitalize(weekdayName(date, "long"))} ${day}.`,
  };
}

export function mealMeta(dish: Dish): string {
  return dish.leftoverFriendly ? `${dish.prepMinutes} min · rester` : `${dish.prepMinutes} min`;
}

export function buildWeek(
  weekStart: string,
  today: string,
  meals: MealMap,
  dishes: readonly Dish[],
  profiles: readonly Profile[] = [],
): DayModel[] {
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
  const lastEaten = lastEatenByDish(eatenHistory(meals, today));
  return daysInRange(weekStart, addDaysToKey(weekStart, 6)).map((date) => {
    const meal = meals[date];
    const dish = meal ? dishById.get(meal.dishId) : undefined;
    return {
      date,
      ...dayLabels(date),
      meal,
      dish,
      isToday: date === today,
      isPast: date < today,
      isNew: dish ? isNewDish(dish, lastEaten) : false,
      isUntried: dish ? isUntried(dish.id, lastEaten) && !isNewDish(dish, lastEaten) : false,
      hasOffer: Boolean(meal?.offer),
      locked: Boolean(meal?.locked),
      meta: dish ? mealMeta(dish) : "",
      variantLines: (meal?.variants ?? []).map((variant) => describeVariant(variant, profiles)),
    };
  });
}

/** One day's model (used for sheets that can target a day outside the shown week). */
export function buildDay(
  date: string,
  today: string,
  meals: MealMap,
  dishes: readonly Dish[],
  profiles: readonly Profile[] = [],
): DayModel {
  const [day] = buildWeek(date, today, meals, dishes, profiles);
  if (!day) throw new Error(`Ugyldig dato: ${date}`);
  return day;
}

export function plannedCount(week: readonly DayModel[]): number {
  return week.filter((day) => day.dish).length;
}

export type UseFirstItem = { name: string; label: string; urgent: boolean };

function expiryLabel(days: number): string {
  if (days < 0) return "udløbet";
  if (days === 0) return "i dag";
  if (days === 1) return "i morgen";
  return `${days} dage`;
}

/** Fridge items flagged "use first" or expiring within 3 days, soonest first. */
export function useFirstItems(fridge: readonly FridgeItem[], today: string): UseFirstItem[] {
  return fridge
    .map((item) => ({ item, days: item.expiresOn ? daysBetween(today, item.expiresOn) : undefined }))
    .filter(({ item, days }) => item.useFirst === true || (days !== undefined && days <= 3))
    .sort((a, b) => (a.days ?? 99) - (b.days ?? 99))
    .map(({ item, days }) => ({
      name: item.name,
      label: days === undefined ? item.name : `${item.name} · ${expiryLabel(days)}`,
      urgent: days !== undefined ? days <= 1 : item.useFirst === true,
    }));
}

/** "til og med søndag" end label for the shopping summary. */
export function shoppingUntilLabel(to: string): string {
  return `til og med ${weekdayName(to, "long")}`;
}
