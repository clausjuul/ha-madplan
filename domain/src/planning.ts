/** Planning rules: which days a plan covers, feasibility, planning context, proposal validation and completion. */
import { addDaysToKey, isDateKey } from "./dates.ts";
import { dishAllowed } from "./exclusions.ts";
import { participatingProfiles, preferenceScore } from "./profiles.ts";
import { fridgeMatchScore, matchingFridgeItems, relaxedDayScore } from "./suggest.ts";
import { maxVariantDays, normalizeVariants, suggestVariants } from "./variants.ts";
import { NEVER_SCORE, ratingScores } from "./history.ts";
import { dishOfferMatches, offerReason, offerScore, toOfferReference } from "./offers.ts";
import type { DishOfferMatch } from "./offers.ts";
import {
  normalizePlanningOptions,
  preservedDaysFromRequest,
  relativeRecipeCost,
} from "./planning-rules.ts";
import type {
  DraftDay,
  Dish,
  FridgeItem,
  GroceryStore,
  MealMap,
  MealVariant,
  PlanDraft,
  Profile,
  RetailOffer,
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
  /** Stored retail offers and the stores they count for; offers are a soft bonus, never a filter. */
  offers?: readonly RetailOffer[];
  stores?: readonly GroceryStore[];
  /** Day the offers must be running on (normally today). */
  offersAsOf?: string;
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
  /** Days with plenty of time: no prep-time limit, and a dish may cost a little more. */
  relaxedDates?: readonly string[];
  fridge?: readonly FridgeItem[];
  globalExclusions?: readonly string[];
  profiles?: readonly Profile[];
};

export type PlanningContext = {
  /** Open dates the planner must fill. */
  dates: string[];
  /**
   * Eligible dishes: not archived, no exclusion conflicts, within the prep-time limit. With relaxed
   * days, slower dishes are included too; use fitsDay() to check a dish against a specific date.
   */
  recipes: Dish[];
  /** date -> dishId for locked and request-preserved days. */
  lockedDays: Map<string, string>;
  preservedDates: string[];
  skippedDates: string[];
  eatenDishIds: Set<string>;
  lastEaten: ReadonlyMap<string, string>;
  /** dishId -> adjustment from the family's ratings (see ratingScores). */
  ratingScores: ReadonlyMap<string, number>;
  requiredDishIds: string[];
  newDishCount: number;
  budgetDkk: number | null;
  maxPrepMinutes: number | null;
  /** Open dates with plenty of time (see fitsDay). */
  relaxedDates: string[];
  economical: boolean;
  fridge: FridgeItem[];
  dayRequests: Record<string, string>;
  globalExclusions: string[];
  profiles: Profile[];
  /** dishId -> ingredients of that dish on offer in the chosen stores (only dishes with any). */
  dishOffers: ReadonlyMap<string, DishOfferMatch[]>;
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
  const relaxedDates = [...new Set(input.relaxedDates ?? [])].filter((date) => dates.includes(date)).sort();
  const profiles = participatingProfiles(input.profiles ?? []);
  const globalExclusions = [...(input.globalExclusions ?? [])];
  const ratings = ratingScores(meals);
  const recipes = input.dishes.filter(
    (dish) =>
      !dish.archivedAt &&
      (ratings.get(dish.id) ?? 0) > NEVER_SCORE &&
      dishAllowed(dish, globalExclusions, profiles) &&
      (relaxedDates.length > 0 || withinPrepLimit(dish, options.maxPrepMinutes)),
  );
  return {
    dates,
    recipes,
    lockedDays,
    preservedDates,
    skippedDates,
    eatenDishIds: new Set(input.eatenDishIds ?? []),
    lastEaten: input.lastEaten ?? new Map(),
    ratingScores: ratings,
    requiredDishIds: (input.requiredDishIds ?? []).filter((id) =>
      recipes.some((dish) => dish.id === id),
    ),
    newDishCount: Math.max(0, Math.min(7, Math.floor(input.newDishCount ?? 0))),
    budgetDkk: options.budgetDkk,
    maxPrepMinutes: options.maxPrepMinutes,
    relaxedDates,
    economical: options.economical,
    fridge: [...(input.fridge ?? [])],
    dayRequests,
    globalExclusions,
    profiles,
    dishOffers: offersByDish(recipes, input),
  };
}

function offersByDish(recipes: readonly Dish[], input: PlanningContextInput): Map<string, DishOfferMatch[]> {
  const result = new Map<string, DishOfferMatch[]>();
  const offers = input.offers ?? [];
  const stores = input.stores ?? [];
  const asOf = input.offersAsOf ?? input.dates[0];
  if (offers.length === 0 || stores.length === 0 || !asOf) return result;
  for (const dish of recipes) {
    const matches = dishOfferMatches(dish, offers, stores, asOf);
    if (matches.length > 0) result.set(dish.id, matches);
  }
  return result;
}

/** Planning bonus for a dish's ingredients on offer (0 without offers). */
export const dishOfferScore = (context: Pick<PlanningContext, "dishOffers">, dishId: string): number =>
  offerScore(context.dishOffers.get(dishId) ?? []);

const withinPrepLimit = (dish: Dish, maxPrepMinutes: number | null | undefined): boolean =>
  !maxPrepMinutes || !Number.isFinite(dish.prepMinutes) || dish.prepMinutes <= maxPrepMinutes;

/** Whether a dish may be planned on `date`: the prep-time limit does not apply on relaxed days. */
export function fitsDay(
  dish: Dish,
  date: string,
  context: Pick<PlanningContext, "maxPrepMinutes" | "relaxedDates">,
): boolean {
  return context.relaxedDates.includes(date) || withinPrepLimit(dish, context.maxPrepMinutes);
}

// --- Validating a proposed plan ---------------------------------------------------------------

export type PlanItem = {
  date: string;
  dishId: string;
  reason: string;
  source: "ai" | "local";
  /** Someone gets one part of the dish swapped (see variants.ts). */
  variants?: MealVariant[];
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
  const recipeById = new Map(context.recipes.map((dish) => [dish.id, dish]));
  const seenDates = new Set<string>();
  const seenDishes = new Set(context.lockedDays.values());
  const plan: PlanItem[] = [];
  const variantLimit = maxVariantDays(context.dates.length);
  let variantDays = 0;
  let rejectedCount = 0;
  for (const item of proposals.slice(0, 30)) {
    const date = isRecord(item) ? item.date : undefined;
    const dishId = isRecord(item) ? item.dishId : undefined;
    if (
      !isRecord(item) ||
      typeof date !== "string" ||
      typeof dishId !== "string" ||
      !validDates.has(date) ||
      !recipeById.has(dishId) ||
      !fitsDay(recipeById.get(dishId)!, date, context) ||
      seenDates.has(date) ||
      seenDishes.has(dishId)
    ) {
      rejectedCount += 1;
      continue;
    }
    seenDates.add(date);
    seenDishes.add(dishId);
    const variants =
      variantDays < variantLimit
        ? normalizeVariants(item.variants, recipeById.get(dishId)!, context.profiles, context.globalExclusions)
        : [];
    if (variants.length) variantDays += 1;
    plan.push({
      date,
      dishId,
      reason:
        typeof item.reason === "string"
          ? item.reason.slice(0, 180)
          : "Valgt ud fra dine præferencer.",
      source: "ai",
      ...(variants.length ? { variants } : {}),
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
    let dish = context.recipes.find(
      (candidate) => wanted.includes(candidate.id) && !used.has(candidate.id) && fitsDay(candidate, date, context),
    );
    if (!dish) {
      const needsNovel =
        plan.filter((item) => !context.eatenDishIds.has(item.dishId)).length < context.newDishCount;
      const score = (candidate: Dish): number => {
        const novel = !context.eatenDishIds.has(candidate.id) ? 1 : 0;
        const relaxed = context.relaxedDates.includes(date);
        const pantry = matchingFridgeItems(candidate.ingredients, context.fridge, date).reduce(
          (total, match) => total + fridgeMatchScore(match) / 2,
          0,
        );
        return (
          (needsNovel && novel ? 100 : 0) +
          pantry -
          (categories.get(candidate.category) ?? 0) * 12 -
          (context.economical || context.budgetDkk
            ? relativeRecipeCost(candidate, context.fridge) * (relaxed ? 4 : 12)
            : 0) +
          (relaxed ? relaxedDayScore(candidate) : 0) +
          dayWishScore(candidate, context.dayRequests[date]) +
          preferenceScore(candidate, context.profiles) +
          (context.ratingScores.get(candidate.id) ?? 0) +
          dishOfferScore(context, candidate.id)
        );
      };
      dish = context.recipes
        .filter((candidate) => !used.has(candidate.id) && fitsDay(candidate, date, context))
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

/**
 * Gives days without a variant one when a profile with safe foods dislikes a part of the dish,
 * until the plan has maxVariantDays() days with a variant.
 */
export function addSuggestedVariants(items: readonly PlanItem[], context: PlanningContext): PlanItem[] {
  let left = maxVariantDays(context.dates.length) - items.filter((item) => item.variants?.length).length;
  return items.map((item) => {
    if (left <= 0 || item.variants?.length) return item;
    const dish = context.recipes.find((candidate) => candidate.id === item.dishId);
    const variants = dish ? suggestVariants(dish, context.profiles, context.globalExclusions) : [];
    if (!variants.length) return item;
    left -= 1;
    return { ...item, variants };
  });
}

/** Turns plan items into a draft; locked/preserved days from the context are included as locked. */
export function toDraft(
  items: readonly PlanItem[],
  context: PlanningContext,
  meals: MealMap,
  message?: string,
): PlanDraft {
  const planned: DraftDay[] = addSuggestedVariants(items, context).map((item) => {
    const matches = context.dishOffers.get(item.dishId) ?? [];
    const best = [...matches].sort((a, b) => (b.offer.normalPriceOre ?? 0) - b.offer.amountOre - ((a.offer.normalPriceOre ?? 0) - a.offer.amountOre))[0];
    // Say so when an offer helped, unless the reason (e.g. from the AI) already does.
    const offerNote = best && !/tilbud/iu.test(item.reason) ? offerReason(matches) : "";
    return {
      date: item.date,
      dishId: item.dishId,
      reason: offerNote ? `${item.reason} ${offerNote}`.trim().slice(0, 240) : item.reason,
      locked: false,
      source: item.source,
      ...(best ? { offer: toOfferReference(best.offer) } : {}),
      ...(item.variants?.length ? { variants: item.variants } : {}),
    };
  });
  const kept: DraftDay[] = [...context.lockedDays].map(([date, dishId]) => {
    const meal = meals[date];
    return {
      date,
      dishId,
      reason: meal?.reason ?? "Bevaret fra den eksisterende plan.",
      locked: meal?.locked ?? false,
      source: meal?.source ?? "manual",
      offer: meal?.offer,
      ...(meal?.variants?.length ? { variants: meal.variants } : {}),
    };
  });
  return {
    days: [...planned, ...kept].sort((a, b) => a.date.localeCompare(b.date)),
    message,
  };
}
