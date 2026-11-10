import {
  EMPTY_SHOPPING_STATE,
  createShoppingList,
  isUntried,
  profileServings,
  targetServings,
  type BootstrapResponse,
  type Dish,
  type DraftDay,
  type MealMap,
  type PlanDraftRecord,
} from "@madplan/domain";

export type DraftSummary = {
  dishCount: number;
  newDishCount: number;
  /** Estimated shopping for the draft days, in DKK (0 when nothing could be priced). */
  estimatedCostDkk: number;
  /** Average prep time in minutes, or null for an empty draft. */
  averageMinutes: number | null;
};

export const dayDishId = (day: DraftDay): string => day.dishId ?? day.newDish.id;

/** The dish a draft day points to: a proposed new one, or one from the library. */
export function dishOfDay(day: DraftDay, dishes: readonly Dish[]): Dish | undefined {
  return day.newDish ?? dishes.find((dish) => dish.id === day.dishId);
}

export type DayBadge = "new" | "untried" | null;

/** "Ny ret" only for dishes the planner proposes that are not in the library yet; an uneaten library dish is just "Ikke prøvet". */
export function draftDayBadge(day: DraftDay, lastEaten: ReadonlyMap<string, string>): DayBadge {
  if (day.newDish !== undefined) return "new";
  return isUntried(dayDishId(day), lastEaten) ? "untried" : null;
}
type SummaryData = Pick<BootstrapResponse, "meals" | "dishes" | "fridge" | "pantry" | "profiles" | "settings">;

/** Numbers for the review side panel, computed from the draft days alone (the real week is not touched). */
export function summarizeDraft(draft: Pick<PlanDraftRecord, "days">, data: SummaryData, today: string): DraftSummary {
  const days = [...draft.days].sort((a, b) => a.date.localeCompare(b.date));
  if (days.length === 0) return { dishCount: 0, newDishCount: 0, estimatedCostDkk: 0, averageMinutes: null };
  const dishes = [...data.dishes, ...days.flatMap((day) => (day.newDish ? [day.newDish] : []))];
  const meals: MealMap = {};
  for (const day of days) {
    meals[day.date] = { dishId: dayDishId(day), locked: day.locked, note: "", source: day.source };
  }
  const list = createShoppingList({
    listId: "draft",
    from: days[0]?.date ?? today,
    to: days.at(-1)?.date ?? today,
    meals,
    dishes,
    fridge: data.fridge,
    pantry: data.pantry,
    state: EMPTY_SHOPPING_STATE,
    servings: targetServings(profileServings(data.profiles), data.settings.preferredServings),
  });
  const minutes = days.flatMap((day) => {
    const dish = dishOfDay(day, dishes);
    return dish ? [dish.prepMinutes] : [];
  });
  return {
    dishCount: days.length,
    newDishCount: days.filter((day) => day.newDish !== undefined).length,
    estimatedCostDkk: list.totalEstimatedPrice,
    averageMinutes: minutes.length ? Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length) : null,
  };
}

/** Honest label for who made the plan. The local engine is never called AI. */
export function engineLabel(engine: PlanDraftRecord["engine"]): string {
  return engine === "ai" ? "Lavet af Assist med websøgning" : "Hurtigt forslag ud fra jeres retter";
}
