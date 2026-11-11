/** Planning rules: which days a plan covers, feasibility, planning context, proposal validation and completion. */
import { addDaysToKey, isDateKey } from "./dates.ts";
import { dishAllowed } from "./exclusions.ts";
import { participatingProfiles, preferenceScore } from "./profiles.ts";
import { fridgeMatchScore, matchingFridgeItems } from "./suggest.ts";
import {
  normalizePlanningOptions,
  preservedDaysFromRequest,
  relativeRecipeCost,
} from "./planning-rules.ts";
import type {
  DraftDay,
  Dish,
  FridgeItem,
  MealMap,
  PlanDraft,
  Profile,
} from "./types.ts";

// --- Which days does a plan cover? -------------------------------------------------------------

export type PlanWindow = {
  /** First candidate date. Dates before `today` are never planned. */
  start: string;
  /** Number of cooking days wanted. */
  dayCount: number;
  skippedDates?: readonly string[];
  today: string;
  /** How many calendar days ahead to look for open days. Default 60. */
  horizonDays?: number;
};

/** Consecutive open days from max(start, today): skipped dates are stepped over, not counted. */
export function planningDays(window: PlanWindow): string[] {
  const first = window.start < window.today ? window.today : window.start;
  const skipped = new Set(window.skippedDates ?? []);
  const wanted = Math.max(0, Math.floor(window.dayCount));
  const horizon = window.horizonDays ?? 60;
  const days: string[] = [];
  for (let offset = 0; offset < horizon && days.length < wanted; offset += 1) {
    const day = addDaysToKey(first, offset);
    if (!skipped.has(day)) days.push(day);
  }
  return days;
}

// --- Feasibility ------------------------------------------------------------------------------

export type FeasibilityInput = {
  /** The days the plan covers. */
  dates: readonly string[];
  meals: MealMap;
  requiredDishIds: readonly string[];
  newDishCount: number;
};

export type Feasibility = {
  ok: boolean;
  unlockedDayCount: number;
  requiredUnlockedCount: number;
  /** Danish explanation when `ok` is false. */
  message?: string;
};

function lockedDishIds(dates: readonly string[], meals: MealMap): Set<string> {
  return new Set(
    dates.flatMap((date) => {
      const meal = meals[date];
      return meal?.locked ? [meal.dishId] : [];
    }),
  );
}

const unlockedCount = (dates: readonly string[], meals: MealMap): number =>
  dates.filter((date) => !meals[date]?.locked).length;

/** New dishes + required dishes must fit into the unlocked days. */
export function checkFeasibility(input: FeasibilityInput): Feasibility {
  const { dates, meals, requiredDishIds, newDishCount } = input;
  const locked = lockedDishIds(dates, meals);
  const unlockedDayCount = unlockedCount(dates, meals);
  const requiredUnlockedCount = requiredDishIds.filter((id) => !locked.has(id)).length;
  const newDishesFit =
    newDishCount <= unlockedDayCount &&
    requiredUnlockedCount <= unlockedDayCount - newDishCount;
  const ok = dates.length > 0 && requiredUnlockedCount <= unlockedDayCount && newDishesFit;
  let message: string | undefined;
  if (dates.length === 0) message = "Vælg mindst én maddag, før planen laves.";
  else if (!newDishesFit) message = "Justér antallet af nye eller valgte retter, før planen laves.";
  else if (!ok) message = "Fjern en valgt ret, eller vælg flere maddage, før planen laves.";
  return { ok, unlockedDayCount, requiredUnlockedCount, message };
}

/** Whether `dishId` can still be added to the required dishes without breaking feasibility. */
export function canIncludeDish(dishId: string, input: FeasibilityInput): boolean {
  const locked = lockedDishIds(input.dates, input.meals);
  const proposed = input.requiredDishIds.includes(dishId)
    ? input.requiredDishIds
    : [...input.requiredDishIds, dishId];
  return (
    proposed.filter((id) => !locked.has(id)).length <=
    unlockedCount(input.dates, input.meals) - input.newDishCount
  );
}

// --- Planning context -------------------------------------------------------------------------

export type PlanningContextInput = {
  dishes: readonly Dish[];
  /** Candidate dates, normally from planningDays(). */
  dates: readonly string[];
  meals: MealMap;
  /** Dish ids that count as already tried (see eatenHistory). */
  eatenDishIds?: Iterable<string>;
  /** dishId -> date last eaten (see lastEatenByDish). */
  lastEaten?: ReadonlyMap<string, string>;
  requiredDishIds?: readonly string[];
  newDishCount?: number;
  request?: string;
  dayRequests?: Readonly<Record<string, string>>;
  budgetDkk?: number | null;
  maxPrepMinutes?: number | null;
  fridge?: readonly FridgeItem[];
  globalExclusions?: readonly string[];
  profiles?: readonly Profile[];
};

export type PlanningContext = {
  /** Open dates the planner must fill. */
  dates: string[];
  /** Eligible dishes: not archived, no exclusion conflicts, within the prep-time limit. */
  recipes: Dish[];
  /** date -> dishId for locked and request-preserved days. */
  lockedDays: Map<string, string>;
  preservedDates: string[];
  skippedDates: string[];
  eatenDishIds: Set<string>;
  lastEaten: ReadonlyMap<string, string>;
  requiredDishIds: string[];
  newDishCount: number;
  budgetDkk: number | null;
  maxPrepMinutes: number | null;
  economical: boolean;
  fridge: FridgeItem[];
  dayRequests: Record<string, string>;
  globalExclusions: string[];
  profiles: Profile[];
};

export function buildPlanningContext(input: PlanningContextInput): PlanningContext {
  const meals = input.meals;
  const valid = [...new Set(input.dates.filter(isDateKey))];
  const skippedDates = valid.filter((date) => meals[date]?.skipped);
  const skipped = new Set(skippedDates);
  const existing = valid.flatMap((date) => {
    const meal = meals[date];
    return meal && !meal.skipped ? [{ date, locked: meal.locked }] : [];
  });
  const preservedDates = preservedDaysFromRequest(input.request ?? "", valid, existing);
  const protectedDates = new Set([
    ...existing.filter((item) => item.locked).map((item) => item.date),
    ...preservedDates,
  ]);
  const lockedDays = new Map<string, string>();
  for (const date of valid) {
    const meal = meals[date];
    if (protectedDates.has(date) && meal && !meal.skipped) lockedDays.set(date, meal.dishId);
  }
  const dates = valid.filter((date) => !skipped.has(date) && !lockedDays.has(date));

  const dayRequests: Record<string, string> = {};
  for (const [date, wish] of Object.entries(input.dayRequests ?? {})) {
    if (dates.includes(date) && wish.trim()) dayRequests[date] = wish.trim().slice(0, 300);
  }

  const options = normalizePlanningOptions({
    budgetDkk: input.budgetDkk,
    maxPrepMinutes: input.maxPrepMinutes,
    request: input.request,
  });
  const profiles = participatingProfiles(input.profiles ?? []);
  const globalExclusions = [...(input.globalExclusions ?? [])];
  const recipes = input.dishes.filter(
    (dish) =>
      !dish.archivedAt &&
      dishAllowed(dish, globalExclusions, profiles) &&
      (!options.maxPrepMinutes ||
        !Number.isFinite(dish.prepMinutes) ||
        dish.prepMinutes <= options.maxPrepMinutes),
  );
  return {
    dates,
    recipes,
    lockedDays,
    preservedDates,
    skippedDates,
    eatenDishIds: new Set(input.eatenDishIds ?? []),
    lastEaten: input.lastEaten ?? new Map(),
    requiredDishIds: (input.requiredDishIds ?? []).filter((id) =>
      recipes.some((dish) => dish.id === id),
    ),
    newDishCount: Math.max(0, Math.min(7, Math.floor(input.newDishCount ?? 0))),
    budgetDkk: options.budgetDkk,
    maxPrepMinutes: options.maxPrepMinutes,
    economical: options.economical,
    fridge: [...(input.fridge ?? [])],
    dayRequests,
    globalExclusions,
    profiles,
  };
}

// --- Validating a proposed plan ---------------------------------------------------------------

export type PlanItem = {
  date: string;
  dishId: string;
  reason: string;
  source: "ai" | "local";
};

export type ValidatedPlan = {
  plan: PlanItem[];
  rejectedCount: number;
  missingDates: string[];
  requiredMissing: string[];
  newDishCount: number;
  newDishTarget: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Keeps only the usable part of an untrusted proposal (for example from an AI): known open dates,
 * eligible dishes, one dish per date and no dish used twice (locked days included).
 */
export function validateProposal(raw: unknown, context: PlanningContext): ValidatedPlan {
  const proposals: unknown[] = Array.isArray(raw) ? raw : [];
  const validDates = new Set(context.dates);
  const validIds = new Set(context.recipes.map((dish) => dish.id));
  const seenDates = new Set<string>();
  const seenDishes = new Set(context.lockedDays.values());
  const plan: PlanItem[] = [];
  let rejectedCount = 0;
  for (const item of proposals.slice(0, 30)) {
    const date = isRecord(item) ? item.date : undefined;
    const dishId = isRecord(item) ? item.dishId : undefined;
    if (
      !isRecord(item) ||
      typeof date !== "string" ||
      typeof dishId !== "string" ||
      !validDates.has(date) ||
      !validIds.has(dishId) ||
      seenDates.has(date) ||
      seenDishes.has(dishId)
    ) {
      rejectedCount += 1;
      continue;
    }
    seenDates.add(date);
    seenDishes.add(dishId);
    plan.push({
      date,
      dishId,
      reason:
        typeof item.reason === "string"
          ? item.reason.slice(0, 180)
          : "Valgt ud fra dine præferencer.",
      source: "ai",
    });
  }
  plan.sort((a, b) => a.date.localeCompare(b.date));
  return summarize(plan, context, rejectedCount);
}

function summarize(plan: PlanItem[], context: PlanningContext, rejectedCount: number): ValidatedPlan {
  const lockedIds = new Set(context.lockedDays.values());
  return {
    plan,
    rejectedCount,
    missingDates: context.dates.filter((date) => !plan.some((item) => item.date === date)),
    requiredMissing: context.requiredDishIds.filter(
      (id) => !plan.some((item) => item.dishId === id) && !lockedIds.has(id),
    ),
    newDishCount: plan.filter((item) => !context.eatenDishIds.has(item.dishId)).length,
    newDishTarget: context.newDishCount,
  };
}

function dayWishScore(dish: Dish, request: string | undefined): number {
  const wish = (request ?? "").normalize("NFKC").toLocaleLowerCase("da-DK");
  if (!wish) return 0;
  const label = [dish.name, dish.category, ...dish.ingredients]
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("da-DK");
  const ignored = new Set(["gerne", "noget", "skal", "være", "mad", "ret", "til", "denne", "dag"]);
  const terms = [...new Set(wish.split(/[^a-zæøå0-9]+/u))].filter(
    (term) => term.length >= 3 && !ignored.has(term),
  );
  const quick = /\b(?:hurtig|hurtigt|nem|travl)\b/u.test(wish);
  const leftovers = /\b(?:rest|rester|restemad)\b/u.test(wish);
  return (
    terms.filter((term) => label.includes(term)).length * 18 +
    (quick && dish.prepMinutes <= 30 ? 28 : 0) +
    (leftovers && dish.leftoverFriendly ? 30 : 0)
  );
}

/**
 * Fills the dates a proposal left open, deterministically and without ever using an excluded
 * or already-used dish. Required dishes come first, then novelty/fridge/budget/wish scoring.
 */
export function completePlan(validated: ValidatedPlan, context: PlanningContext): ValidatedPlan {
  const plan = [...validated.plan];
  const used = new Set([...context.lockedDays.values(), ...plan.map((item) => item.dishId)]);
  const categories = new Map<string, number>();
  for (const item of plan) {
    const category = context.recipes.find((dish) => dish.id === item.dishId)?.category ?? "Andet";
    categories.set(category, (categories.get(category) ?? 0) + 1);
  }
  const wanted = context.requiredDishIds.filter((id) => !used.has(id));

  for (const date of validated.missingDates) {
    let dish = context.recipes.find((candidate) => wanted.includes(candidate.id) && !used.has(candidate.id));
    if (!dish) {
      const needsNovel =
        plan.filter((item) => !context.eatenDishIds.has(item.dishId)).length < context.newDishCount;
      const score = (candidate: Dish): number => {
        const novel = !context.eatenDishIds.has(candidate.id) ? 1 : 0;
        const pantry = matchingFridgeItems(candidate.ingredients, context.fridge, date).reduce(
          (total, match) => total + fridgeMatchScore(match) / 2,
          0,
        );
        return (
          (needsNovel && novel ? 100 : 0) +
          pantry -
          (categories.get(candidate.category) ?? 0) * 12 -
          (context.economical || context.budgetDkk
            ? relativeRecipeCost(candidate, context.fridge) * 12
            : 0) +
          dayWishScore(candidate, context.dayRequests[date]) +
          preferenceScore(candidate, context.profiles)
        );
      };
      dish = context.recipes
        .filter((candidate) => !used.has(candidate.id))
        .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, "da-DK"))[0];
    }
    if (!dish) continue;
    used.add(dish.id);
    const index = wanted.indexOf(dish.id);
    if (index >= 0) wanted.splice(index, 1);
    categories.set(dish.category, (categories.get(dish.category) ?? 0) + 1);
    plan.push({
      date,
      dishId: dish.id,
      reason: "Suppleret af planlæggeren for at følge dine valg og undgå gentagelser.",
      source: "local",
    });
  }
  plan.sort((a, b) => a.date.localeCompare(b.date));
  return summarize(plan, context, validated.rejectedCount);
}

/** Turns plan items into a draft; locked/preserved days from the context are included as locked. */
export function toDraft(
  items: readonly PlanItem[],
  context: PlanningContext,
  meals: MealMap,
  message?: string,
): PlanDraft {
  const planned: DraftDay[] = items.map((item) => ({
    date: item.date,
    dishId: item.dishId,
    reason: item.reason,
    locked: false,
    source: item.source,
  }));
  const kept: DraftDay[] = [...context.lockedDays].map(([date, dishId]) => {
    const meal = meals[date];
    return {
      date,
      dishId,
      reason: meal?.reason ?? "Bevaret fra den eksisterende plan.",
      locked: meal?.locked ?? false,
      source: meal?.source ?? "manual",
      offer: meal?.offer,
    };
  });
  return {
    days: [...planned, ...kept].sort((a, b) => a.date.localeCompare(b.date)),
    message,
  };
}
