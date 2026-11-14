import type { Hono } from "hono";
import { dishOfferMatches, offerReason, offerScore, toOfferReference, createLocalSuggestions, normalizeVariants } from "@madplan/domain";
import type { Meal, MealMap, MealVariant, SuggestDayInput, SwapMealsInput } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { badRequest, conflict, notFound, unprocessable } from "../errors.ts";
import { readJson } from "../http.ts";
import { lastEaten, snapshot } from "../state.ts";
import { allDishes, findDish } from "../store-dishes.ts";
import { deleteMeal, getMeal, getMeals, putMeal } from "../store-meals.ts";
import { dateParam, mealInput } from "../validate.ts";
import { num, rec } from "../validate-basic.ts";

const LOCKED = "Måltidet er låst. Lås det op, før du ændrer det.";

/** A locked meal may only be replaced by one that differs in `locked` alone (i.e. unlocking it). */
function onlyLockChanges(existing: Meal, next: Meal): boolean {
  const key = (meal: Meal): string =>
    JSON.stringify([
      meal.dishId,
      meal.note,
      meal.source,
      meal.reason ?? null,
      meal.offer ?? null,
      meal.skipped ?? false,
      meal.variants ?? [],
    ]);
  return key(existing) === key(next);
}

export function mealRoutes(api: Hono, deps: Deps): void {
  const { repo } = deps;

  const assertDish = (dishId: string): void => {
    if (!findDish(repo.db, dishId)) throw unprocessable("Retten findes ikke.");
  };

  /** Only variants that fit the dish and an active profile's safe foods are kept. */
  const fitVariants = (dishId: string, variants: readonly MealVariant[]): MealVariant[] => {
    const dish = findDish(repo.db, dishId);
    if (!dish) return [];
    const state = snapshot(deps);
    return normalizeVariants(variants, dish, state.profiles, state.settings.globalExclusions);
  };

  api.put("/meals/:date", async (c) => {
    const date = dateParam(c.req.param("date"));
    const input = mealInput(await readJson(c), false);
    const dishId = input.dishId ?? "";
    assertDish(dishId);
    const meal: Meal = {
      dishId,
      locked: input.locked ?? false,
      note: input.note ?? "",
      source: input.source ?? "manual",
    };
    if (input.reason) meal.reason = input.reason;
    if (input.offer) meal.offer = input.offer;
    if (input.skipped) meal.skipped = true;
    if (input.rating) meal.rating = input.rating;
    const variants = input.variants ? fitVariants(dishId, input.variants) : [];
    if (variants.length) meal.variants = variants;
    const existing = getMeal(repo.db, date);
    if (existing?.locked && !onlyLockChanges(existing, meal)) throw conflict(LOCKED);
    return c.json(repo.mutate(["meals", "shopping"], () => (putMeal(repo.db, date, meal), meal)));
  });

  api.patch("/meals/:date", async (c) => {
    const date = dateParam(c.req.param("date"));
    const patch = mealInput(await readJson(c), true);
    if (patch.dishId !== undefined) assertDish(patch.dishId);
    const existing = getMeal(repo.db, date);
    if (!existing) throw notFound("Der er ikke planlagt noget den dag.");
    const { rating, variants, ...rest } = patch;
    const merged: Meal = { ...existing, ...rest };
    const changedDish = rest.dishId !== undefined && rest.dishId !== existing.dishId;
    const nextVariants =
      variants === null ? [] : fitVariants(merged.dishId, variants ?? (changedDish ? [] : existing.variants ?? []));
    if (nextVariants.length) merged.variants = nextVariants;
    else delete merged.variants;
    if (patch.skipped === false) delete merged.skipped;
    if (rating === null) delete merged.rating;
    else if (rating !== undefined) merged.rating = rating;
    // A different dish starts without the old dish's rating.
    else if (rest.dishId !== undefined && rest.dishId !== existing.dishId) delete merged.rating;
    return c.json(repo.mutate(["meals", "shopping"], () => (putMeal(repo.db, date, merged), merged)));
  });

  api.delete("/meals/:date", (c) => {
    const date = dateParam(c.req.param("date"));
    const existing = getMeal(repo.db, date);
    if (!existing) throw notFound("Der er ikke planlagt noget den dag.");
    if (existing.locked) throw conflict(LOCKED);
    repo.mutate(["meals", "shopping"], () => deleteMeal(repo.db, date));
    return c.body(null, 204);
  });

  api.post("/meals/swap", async (c) => {
    const body = rec(await readJson(c), "Ombytning");
    const input: SwapMealsInput = {
      a: dateParam(typeof body.a === "string" ? body.a : undefined),
      b: dateParam(typeof body.b === "string" ? body.b : undefined),
    };
    if (input.a === input.b) throw badRequest("Vælg to forskellige dage.");
    const first = getMeal(repo.db, input.a);
    const second = getMeal(repo.db, input.b);
    if (!first && !second) throw notFound("Ingen af dagene har en planlagt ret.");
    if (first?.locked || second?.locked) throw conflict(LOCKED);
    repo.mutate(["meals", "shopping"], () => {
      if (second) putMeal(repo.db, input.a, second);
      else deleteMeal(repo.db, input.a);
      if (first) putMeal(repo.db, input.b, first);
      else deleteMeal(repo.db, input.b);
    });
    const meals = getMeals(repo.db);
    const result: MealMap = {};
    for (const date of [input.a, input.b]) {
      const meal = meals[date];
      if (meal) result[date] = meal;
    }
    return c.json(result);
  });

  api.post("/meals/:date/suggest", async (c) => {
    const date = dateParam(c.req.param("date"));
    const body = rec(await readJson(c), "Forslag");
    const input: SuggestDayInput = { seed: num(body.seed, "Seed", { int: true }) };
    const existing = getMeal(repo.db, date);
    if (existing?.locked) throw conflict(LOCKED);
    const state = snapshot(deps);
    // Other days count as "used"; the day being replaced does not.
    const others = { ...state.meals };
    delete others[date];
    const dishes = allDishes(repo.db);
    const stores = state.settings.preferredStores;
    const offerMatches = new Map(
      dishes.map((dish) => [dish.id, dishOfferMatches(dish, state.offers, stores, state.today)] as const).filter(([, matches]) => matches.length > 0),
    );
    const suggestion = createLocalSuggestions({
      days: [date],
      meals: others,
      fridge: state.fridge,
      lastEaten: lastEaten({ ...state, meals: others }),
      seed: input.seed,
      dishes,
      globalExclusions: state.settings.globalExclusions,
      profiles: state.profiles,
      offerScores: new Map([...offerMatches].map(([id, matches]) => [id, offerScore(matches)])),
    })[0];
    if (!suggestion || !suggestion.dishId) throw unprocessable("Der kunne ikke findes et forslag til dagen.");
    const matches = offerMatches.get(suggestion.dishId) ?? [];
    const best = matches[0];
    const meal: Meal = {
      dishId: suggestion.dishId,
      locked: false,
      note: existing?.note ?? "",
      source: "local",
      reason: best ? `${suggestion.reason} ${offerReason(matches)}`.trim() : suggestion.reason,
      ...(best ? { offer: toOfferReference(best.offer) } : {}),
    };
    return c.json(repo.mutate(["meals", "shopping"], () => (putMeal(repo.db, date, meal), meal)));
  });
}
