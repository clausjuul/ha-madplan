/** "Tjekket mod jeres regler": structured, deterministic checks of a proposed plan. */
import { daysBetween, formatShortDate } from "./dates.ts";
import { dishConflictReasons } from "./exclusions.ts";
import { formatPrice } from "./pricing.ts";
import { createShoppingList } from "./shopping.ts";
import type { EatenEntry } from "./history.ts";
import type { PlanningContext } from "./planning.ts";
import type { Dish, MealMap, PlanDraft } from "./types.ts";

export const REPEAT_WINDOW_DAYS = 14;

export type CheckStatus = "ok" | "warning" | "violation" | "skipped";
export type PlanCheckId =
  | "coverage"
  | "exclusions"
  | "repeats"
  | "prepTime"
  | "budget"
  | "required"
  | "newDishes";

export type PlanCheck = {
  id: PlanCheckId;
  /** Short Danish heading. */
  label: string;
  status: CheckStatus;
  /** Danish explanation of the result. */
  message: string;
  /** Dates the finding concerns (empty when not date-specific). */
  dates: string[];
};

export type PlanReview = {
  checks: PlanCheck[];
  /** True when no check is a violation (warnings are allowed). */
  passed: boolean;
  /** Locked and request-preserved dates that the planner did not touch. */
  protectedDates: string[];
  rejectedSuggestions: number;
  unresolvedDates: string[];
  /** Rough shopping estimate for the plan, or null when it was not needed. */
  estimatedCostDkk: number | null;
  /** Active profiles that contributed exclusions or preferences. */
  familyProfilesApplied: number;
};

export type PlanReviewInput = {
  draft: PlanDraft;
  context: PlanningContext;
  dishes: readonly Dish[];
  meals: MealMap;
  /** Derived history (see eatenHistory). */
  eaten: readonly EatenEntry[];
  pantry?: readonly string[];
  rejectedCount?: number;
};

type Occurrence = { date: string; dishId: string };

export function reviewPlan(input: PlanReviewInput): PlanReview {
  const { draft, context } = input;
  const dishById = new Map(input.dishes.map((dish) => [dish.id, dish]));
  const days = draft.days.flatMap((day) => {
    const dish = day.newDish ?? (day.dishId ? dishById.get(day.dishId) : undefined);
    return dish ? [{ day, dish, dishId: dish.id }] : [];
  });
  for (const { dish } of days) dishById.set(dish.id, dish);

  const unresolvedDates = context.dates.filter((date) => !days.some((item) => item.day.date === date));
  const checks: PlanCheck[] = [
    coverageCheck(unresolvedDates),
    exclusionsCheck(days, context),
    repeatsCheck(days, input),
    prepTimeCheck(days, context),
    ...budgetCheck(days, input, dishById),
    requiredCheck(days, context),
    newDishesCheck(days, context),
  ];
  const budget = checks.find((check) => check.id === "budget");
  return {
    checks,
    passed: !checks.some((check) => check.status === "violation"),
    protectedDates: [...context.lockedDays.keys()].sort(),
    rejectedSuggestions: input.rejectedCount ?? 0,
    unresolvedDates,
    estimatedCostDkk: budget?.status === "skipped" ? null : estimateCost(days, input, dishById),
    familyProfilesApplied: context.profiles.filter(
      (profile) => profile.exclusions.length > 0 || profile.preferences.length > 0,
    ).length,
  };
}

type PlannedDay = { day: PlanDraft["days"][number]; dish: Dish; dishId: string };

function coverageCheck(unresolved: string[]): PlanCheck {
  const label = "Alle maddage har en ret";
  return unresolved.length
    ? {
        id: "coverage",
        label,
        status: "violation",
        message: `${unresolved.length} ${unresolved.length === 1 ? "dag mangler" : "dage mangler"} stadig en ret.`,
        dates: unresolved,
      }
    : { id: "coverage", label, status: "ok", message: "Alle valgte dage er planlagt.", dates: [] };
}

function exclusionsCheck(days: PlannedDay[], context: PlanningContext): PlanCheck {
  const label = "Kostfravalg";
  const hasRules =
    context.globalExclusions.length > 0 ||
    context.profiles.some((profile) => profile.exclusions.length > 0);
  if (!hasRules) {
    return { id: "exclusions", label, status: "skipped", message: "Ingen fravalg er angivet.", dates: [] };
  }
  const hits = days.flatMap(({ day, dish }) => {
    const reasons = dishConflictReasons(dish, context.globalExclusions, context.profiles);
    return reasons.length ? [{ date: day.date, text: `${dish.name} (${reasons.join(", ")})` }] : [];
  });
  return hits.length
    ? {
        id: "exclusions",
        label,
        status: "violation",
        message: `Rammer jeres fravalg: ${hits.map((hit) => hit.text).join("; ")}.`,
        dates: hits.map((hit) => hit.date),
      }
    : { id: "exclusions", label, status: "ok", message: "Ingen retter rammer jeres fravalg.", dates: [] };
}

function repeatsCheck(days: PlannedDay[], input: PlanReviewInput): PlanCheck {
  const label = "Gentagelser";
  const draftDates = new Set(days.map((item) => item.day.date));
  const occurrences: Occurrence[] = [
    ...input.eaten,
    ...Object.entries(input.meals)
      .filter(([date, meal]) => !meal.skipped && !draftDates.has(date))
      .map(([date, meal]) => ({ date, dishId: meal.dishId })),
    ...days.map((item) => ({ date: item.day.date, dishId: item.dishId })),
  ];
  const repeats = days.flatMap(({ day, dish, dishId }) => {
    const previous = occurrences
      .filter((entry) => entry.dishId === dishId && entry.date < day.date)
      .map((entry) => entry.date)
      .sort()
      .pop();
    if (!previous || daysBetween(previous, day.date) > REPEAT_WINDOW_DAYS) return [];
    return [{ date: day.date, text: `${dish.name} (sidst ${formatShortDate(previous)})` }];
  });
  return repeats.length
    ? {
        id: "repeats",
        label,
        status: "warning",
        message: `Gentages inden for ${REPEAT_WINDOW_DAYS} dage: ${repeats.map((item) => item.text).join("; ")}.`,
        dates: repeats.map((item) => item.date),
      }
    : {
        id: "repeats",
        label,
        status: "ok",
        message: `Ingen retter gentages inden for ${REPEAT_WINDOW_DAYS} dage.`,
        dates: [],
      };
}

function prepTimeCheck(days: PlannedDay[], context: PlanningContext): PlanCheck {
  const label = "Tilberedningstid";
  const max = context.maxPrepMinutes;
  if (max === null) {
    return { id: "prepTime", label, status: "skipped", message: "Ingen tidsgrænse er valgt.", dates: [] };
  }
  const relaxed = new Set(context.relaxedDates);
  const slow = days.filter(({ day, dish }) => dish.prepMinutes > max && !relaxed.has(day.date));
  if (!slow.length) {
    return {
      id: "prepTime",
      label,
      status: "ok",
      message: relaxed.size
        ? `Alle retter kan laves på højst ${max} minutter, undtagen på dage med god tid.`
        : `Alle retter kan laves på højst ${max} minutter.`,
      dates: [],
    };
  }
  // A locked dish is the family's own choice, so it only warns.
  const status: CheckStatus = slow.some(({ day }) => !day.locked) ? "violation" : "warning";
  return {
    id: "prepTime",
    label,
    status,
    message: `Tager længere end ${max} minutter: ${slow
      .map(({ dish }) => `${dish.name} (${dish.prepMinutes} min.)`)
      .join("; ")}.`,
    dates: slow.map(({ day }) => day.date),
  };
}

function estimateCost(
  days: PlannedDay[],
  input: PlanReviewInput,
  dishById: Map<string, Dish>,
): number | null {
  const dates = days.map((item) => item.day.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  if (!from || !to) return null;
  const meals: MealMap = {};
  for (const { day, dishId } of days) {
    meals[day.date] = {
      dishId,
      locked: day.locked,
      note: "",
      source: day.source,
      offer: day.offer,
      ...(day.variants?.length ? { variants: day.variants } : {}),
    };
  }
  return createShoppingList({
    listId: "review",
    from,
    to,
    meals,
    dishes: [...dishById.values()],
    fridge: input.context.fridge,
    pantry: input.pantry ?? [],
    profiles: input.context.profiles,
  }).totalEstimatedPrice;
}

function budgetCheck(
  days: PlannedDay[],
  input: PlanReviewInput,
  dishById: Map<string, Dish>,
): PlanCheck[] {
  const label = "Budget";
  const budget = input.context.budgetDkk;
  if (budget === null) {
    return [{ id: "budget", label, status: "skipped", message: "Intet budget er valgt.", dates: [] }];
  }
  const cost = estimateCost(days, input, dishById) ?? 0;
  const within = cost <= budget;
  return [
    {
      id: "budget",
      label,
      status: within ? "ok" : "warning",
      message: `Ca. ${formatPrice(cost)} mod et budget på ${formatPrice(budget)} (vejledende pris, ikke butikspris).`,
      dates: [],
    },
  ];
}

function requiredCheck(days: PlannedDay[], context: PlanningContext): PlanCheck {
  const label = "Valgte retter";
  if (!context.requiredDishIds.length) {
    return { id: "required", label, status: "skipped", message: "Ingen retter er valgt på forhånd.", dates: [] };
  }
  const present = new Set([...days.map((item) => item.dishId), ...context.lockedDays.values()]);
  const missing = context.requiredDishIds.filter((id) => !present.has(id));
  return missing.length
    ? {
        id: "required",
        label,
        status: "warning",
        message: `${missing.length} valgt${missing.length === 1 ? " ret" : "e retter"} kom ikke med i planen.`,
        dates: [],
      }
    : { id: "required", label, status: "ok", message: "Alle valgte retter er med.", dates: [] };
}

function newDishesCheck(days: PlannedDay[], context: PlanningContext): PlanCheck {
  const label = "Nye retter";
  const target = context.newDishCount;
  // A new dish is one the planner proposes that is not in the library yet (DraftDay.newDish).
  const count = days.filter(({ day }) => day.newDish !== undefined).length;
  const noun = (n: number): string => `${n} ${n === 1 ? "ny ret" : "nye retter"}`;
  if (target === 0 && count === 0) {
    return { id: "newDishes", label, status: "skipped", message: "Ingen nye retter ønsket.", dates: [] };
  }
  if (count === target) {
    return { id: "newDishes", label, status: "ok", message: `${noun(count)}, som ønsket.`, dates: [] };
  }
  return {
    id: "newDishes",
    label,
    status: "warning",
    message: `${noun(count)}, men I bad om ${target}.`,
    dates: [],
  };
}