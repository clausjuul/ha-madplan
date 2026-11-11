/** Pure-ish planning helpers: build the planning context for a draft and produce/assemble days. */
import {
  buildPlanningContext,
  createLocalSuggestions,
  lastEatenByDish,
  planningDays,
  reviewPlan,
  toDraft,
} from "@madplan/domain";
import type {
  Dish,
  DraftDay,
  MealMap,
  PlanItem,
  PlanningContext,
  PlanRequest,
  PlanReview,
} from "@madplan/domain";
import { eatenOf } from "../state.ts";
import type { Snapshot } from "../state.ts";

export type PlanPrep = {
  context: PlanningContext;
  /** Real meals with pinned draft days overlaid as locked. */
  meals: MealMap;
  dishes: Dish[];
};

export const dayDishId = (day: DraftDay): string => day.dishId ?? day.newDish.id;

export function windowDates(request: PlanRequest, today: string): string[] {
  return planningDays({
    start: request.from,
    dayCount: request.dayCount,
    skippedDates: request.skippedDates,
    today,
  });
}

/** Pinned draft days (locked, or kept as they are) are treated as locked meals the planner must not touch. */
export function prepare(
  state: Snapshot,
  request: PlanRequest,
  dates: readonly string[],
  pinned: readonly DraftDay[] = [],
): PlanPrep {
  const meals: MealMap = { ...state.meals };
  const extraDishes: Dish[] = [];
  for (const day of pinned) {
    if (day.newDish) extraDishes.push(day.newDish);
    meals[day.date] = {
      dishId: dayDishId(day),
      locked: true,
      note: "",
      source: day.source,
      reason: day.reason,
      ...(day.offer ? { offer: day.offer } : {}),
    };
  }
  const dishes = [...state.dishes, ...extraDishes];
  const override = request.fridgeOverride;
  const context = buildPlanningContext({
    dishes,
    dates: [...new Set([...dates, ...pinned.map((day) => day.date)])].sort(),
    meals,
    eatenDishIds: eatenOf(state).map((entry) => entry.dishId),
    lastEaten: lastEatenByDish(eatenOf(state)),
    requiredDishIds: request.requiredDishIds,
    newDishCount: request.newDishCount,
    request: request.request,
    dayRequests: request.dayRequests,
    budgetDkk: request.budgetDkk,
    maxPrepMinutes: request.maxPrepMinutes,
    fridge: override ? override.map((name) => ({ name })) : state.fridge,
    globalExclusions: state.settings.globalExclusions,
    profiles: state.profiles,
  });
  return { context, meals, dishes };
}

export function localItems(state: Snapshot, request: PlanRequest, prep: PlanPrep): PlanItem[] {
  const { context, meals } = prep;
  const days = [...new Set([...context.dates, ...context.lockedDays.keys()])].sort();
  const suggestions = createLocalSuggestions({
    days,
    meals,
    fridge: context.fridge,
    lastEaten: lastEatenByDish(eatenOf(state)),
    seed: request.seed ?? Math.floor(Math.random() * 1_000_000_000),
    dishes: context.recipes,
    requiredDishIds: context.requiredDishIds,
    userRequest: request.request,
    dayRequests: context.dayRequests,
    globalExclusions: context.globalExclusions,
    profiles: context.profiles,
    ratingScores: context.ratingScores,
  });
  return suggestions.flatMap((day) =>
    day.dishId !== undefined && context.dates.includes(day.date)
      ? [{ date: day.date, dishId: day.dishId, reason: day.reason, source: "local" as const }]
      : [],
  );
}

/** New days from `items`, plus the days that stay as they were (the pinned ones, or the locked ones on a fresh plan). */
export function assemble(
  items: readonly PlanItem[],
  prep: PlanPrep,
  pinned: readonly DraftDay[] | undefined,
): DraftDay[] {
  const all = toDraft(items, prep.context, prep.meals).days;
  const planned = all.filter((day) => prep.context.dates.includes(day.date));
  const kept = pinned ?? all.filter((day) => !prep.context.dates.includes(day.date));
  return [...planned, ...kept].sort((a, b) => a.date.localeCompare(b.date));
}

export function review(
  state: Snapshot,
  prep: PlanPrep,
  days: DraftDay[],
  rejectedCount = 0,
): PlanReview {
  return reviewPlan({
    draft: { days },
    context: prep.context,
    dishes: prep.dishes,
    meals: prep.meals,
    eaten: eatenOf(state),
    pantry: state.pantry,
    rejectedCount,
  });
}
