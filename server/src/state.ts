/** Read-model helpers shared by routes and services. */
import { addDaysToKey, eatenHistory, lastEatenByDish } from "@madplan/domain";
import { dateKeyInZone } from "./timezone.ts";
import type {
  BootstrapResponse,
  Dish,
  FridgeItem,
  MealMap,
  Profile,
  Settings,
  ShoppingList,
} from "@madplan/domain";
import { createShoppingList } from "@madplan/domain";
import type { Deps } from "./deps.ts";
import { haAgentAvailable } from "./ha/agent.ts";
import { getMeals } from "./store-meals.ts";
import { allDishes } from "./store-dishes.ts";
import {
  getFridge,
  getPantry,
  getProfiles,
  getSavedInspirations,
  getSettings,
  getShoppingState,
} from "./store-household.ts";

/** Today's date key in the household's time zone (never the container's local zone). */
export const todayKey = (deps: Deps): string => dateKeyInZone(deps.now(), deps.config.timeZone);

export type Snapshot = {
  today: string;
  meals: MealMap;
  dishes: Dish[];
  profiles: Profile[];
  fridge: FridgeItem[];
  pantry: string[];
  settings: Settings;
};

export function snapshot(deps: Deps): Snapshot {
  const db = deps.repo.db;
  return {
    today: todayKey(deps),
    meals: getMeals(db),
    dishes: allDishes(db),
    profiles: getProfiles(db),
    fridge: getFridge(db),
    pantry: getPantry(db),
    settings: getSettings(db),
  };
}

export function eatenOf(state: Snapshot) {
  return eatenHistory(state.meals, state.today);
}

export const lastEaten = (state: Snapshot) => lastEatenByDish(eatenOf(state));

export function capabilities(deps: Deps): BootstrapResponse["capabilities"] {
  return {
    openai: deps.openai.configured,
    homeAssistantAgent: haAgentAvailable(deps.config),
    offers: deps.config.prejKey.length > 0,
  };
}

export function bootstrap(deps: Deps): BootstrapResponse {
  const db = deps.repo.db;
  const state = snapshot(deps);
  return {
    revision: deps.repo.revision(),
    meals: state.meals,
    dishes: state.dishes,
    profiles: state.profiles,
    fridge: state.fridge,
    pantry: state.pantry,
    settings: state.settings,
    savedInspirations: getSavedInspirations(db),
    capabilities: capabilities(deps),
    isEmpty: deps.repo.isEmpty(),
  };
}

const MAX_DEFAULT_DAYS = 14;

/** Default range: today up to the last planned day (at most 14 days). */
export function defaultRange(meals: MealMap, today: string): { from: string; to: string } {
  const last = Object.keys(meals)
    .filter((date) => date >= today)
    .sort()
    .pop();
  const limit = addDaysToKey(today, MAX_DEFAULT_DAYS - 1);
  const to = last === undefined ? today : last > limit ? limit : last;
  return { from: today, to };
}

export function currentShoppingList(deps: Deps, range: { from?: string; to?: string } = {}): ShoppingList {
  const state = snapshot(deps);
  const fallback = defaultRange(state.meals, state.today);
  const from = range.from ?? fallback.from;
  const to = range.to ?? (range.from && range.from > fallback.to ? range.from : fallback.to);
  return createShoppingList({
    listId: "current",
    from,
    to,
    meals: state.meals,
    dishes: state.dishes,
    fridge: state.fridge,
    pantry: state.pantry,
    state: getShoppingState(deps.repo.db),
    servings: state.settings.preferredServings,
  });
}
