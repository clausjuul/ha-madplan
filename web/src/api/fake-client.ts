import {
  EMPTY_SHOPPING_STATE,
  addDaysToKey,
  addExtra,
  createLocalSuggestions,
  createShoppingList,
  dateKey,
  eatenHistory,
  extraItemId,
  lastEatenByDish,
  profileServings,
  removeExtra,
  targetServings,
  toggleChecked,
  type ChangeEvent,
  type ChangeTopic,
  type Meal,
  type MealMap,
  type ShoppingList,
  type ShoppingListState,
  type ShoppingQuery,
} from "@madplan/domain";
import { ApiRequestError, type ApiClient, type ConnectionHandlers } from "./client";
import { seedFakeState, type FakeState } from "./fake-data";
import { createFakeAssist } from "./fake-assist";
import { createFakeDrafts } from "./fake-drafts";
import { createFakeLibrary } from "./fake-library";

export type FakeClientOptions = {
  /** Date key treated as today when seeding. Defaults to the real today. */
  today?: string;
  /** Artificial latency per call, so optimistic updates are visible in dev. */
  latencyMs?: number;
  /** Start with an empty database (shows the v1 import offer). */
  empty?: boolean;
  /** Report the OpenAI capability as available and answer discovery with clearly labelled demo results. */
  openai?: boolean;
  /** How long the demo "AI" planner takes before its draft is ready. Defaults to 1500. */
  aiDelayMs?: number;
};

const LOCKED = (): ApiRequestError =>
  new ApiRequestError(409, "locked", "Dagen er låst. Lås den op først.");
const NOT_FOUND = (): ApiRequestError =>
  new ApiRequestError(404, "not_found", "Det du leder efter findes ikke.");
/** Mirrors the server: a locked meal may only be replaced by one that differs in `locked` alone. */
function onlyLockChanges(existing: Meal, next: Meal): boolean {
  const key = (meal: Meal): string =>
    JSON.stringify([meal.dishId, meal.note, meal.source, meal.reason ?? null, meal.offer ?? null, meal.skipped ?? false, meal.variants ?? []]);
  return key(existing) === key(next);
}

export function createFakeClient(options: FakeClientOptions = {}): ApiClient {
  const today = options.today ?? dateKey(new Date());
  const latency = options.latencyMs ?? 0;
  const state: FakeState = options.empty
    ? { ...seedFakeState(today), meals: {}, fridge: [], savedInspirations: [] }
    : seedFakeState(today);
  let isEmptyDb = options.empty === true;
  let shoppingState: ShoppingListState = EMPTY_SHOPPING_STATE;
  let revision = 1;
  const listeners = new Set<ConnectionHandlers>();

  const wait = (): Promise<void> =>
    latency > 0 ? new Promise((resolve) => setTimeout(resolve, latency)) : Promise.resolve();

  const emit = (topics: ChangeTopic[]): void => {
    revision += 1;
    const event: ChangeEvent = { revision, topics };
    setTimeout(() => listeners.forEach((handlers) => handlers.onChange(event)), 0);
  };

  const buildShopping = (query?: ShoppingQuery): ShoppingList => {
    const from = query?.from ?? today;
    const planned = Object.keys(state.meals)
      .filter((date) => date >= from)
      .sort();
    const lastPlanned = planned[planned.length - 1] ?? from;
    const limit = addDaysToKey(from, 13);
    const to = query?.to ?? (lastPlanned > limit ? limit : lastPlanned);
    return createShoppingList({
      listId: "current",
      from,
      to,
      meals: state.meals,
      dishes: state.dishes,
      fridge: state.fridge,
      pantry: state.pantry,
      state: shoppingState,
      servings: targetServings(profileServings(state.profiles), state.settings.preferredServings),
      profiles: state.profiles,
    });
  };

  const requireMeal = (date: string): Meal => {
    const found = state.meals[date];
    if (!found) throw NOT_FOUND();
    return found;
  };

  const shoppingMutation = (change: (current: ShoppingListState) => ShoppingListState) => async () => {
    await wait();
    shoppingState = change(shoppingState);
    emit(["shopping"]);
    return buildShopping();
  };

  return {
    mode: "fake",

    async health() {
      await wait();
      return { ok: true, version: "fake" };
    },

    async bootstrap() {
      await wait();
      return structuredClone({
        revision,
        ...state,
        capabilities: { openai: options.openai === true, homeAssistantAgent: false, offers: false },
        isEmpty: Object.keys(state.meals).length === 0 && isEmptyDb,
      });
    },

    async putMeal(date, input) {
      await wait();
      const existing = state.meals[date];
      const next: Meal = {
        dishId: input.dishId,
        locked: input.locked ?? false,
        note: input.note ?? "",
        source: input.source ?? "manual",
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.offer ? { offer: input.offer } : {}),
        ...(input.skipped ? { skipped: true } : {}),
        ...(input.rating ? { rating: input.rating } : {}),
        ...(input.variants?.length ? { variants: input.variants } : {}),
      };
      if (existing?.locked && !onlyLockChanges(existing, next)) throw LOCKED();
      state.meals[date] = next;
      emit(["meals"]);
      return structuredClone(next);
    },

    async patchMeal(date, patch) {
      await wait();
      const current = requireMeal(date);
      const { rating, variants, ...rest } = patch;
      const next: Meal = { ...current, ...rest };
      if (rating === null) delete next.rating;
      else if (rating !== undefined) next.rating = rating;
      if (variants?.length) next.variants = variants;
      else if (variants === null || (variants !== undefined && !variants.length)) delete next.variants;
      else if (rest.dishId !== undefined && rest.dishId !== current.dishId) delete next.variants;
      state.meals[date] = next;
      emit(["meals"]);
      return structuredClone(next);
    },

    async deleteMeal(date) {
      await wait();
      if (requireMeal(date).locked) throw LOCKED();
      delete state.meals[date];
      emit(["meals"]);
    },

    async swapMeals({ a, b }) {
      await wait();
      const first = state.meals[a];
      const second = state.meals[b];
      if (first?.locked || second?.locked) throw LOCKED();
      if (second) state.meals[a] = second;
      else delete state.meals[a];
      if (first) state.meals[b] = first;
      else delete state.meals[b];
      emit(["meals"]);
      const result: MealMap = {};
      for (const date of [a, b]) {
        const entry = state.meals[date];
        if (entry) result[date] = structuredClone(entry);
      }
      return result;
    },

    async suggestMeal(date, input) {
      await wait();
      const current = state.meals[date];
      if (current?.locked) throw LOCKED();
      const others: MealMap = { ...state.meals };
      delete others[date];
      // Treat everything already planned (and eaten) as "last eaten" so suggestions vary.
      const lastEaten = lastEatenByDish([
        ...eatenHistory(others, today),
        ...Object.entries(others).map(([planned, entry]) => ({ date: planned, dishId: entry.dishId })),
      ]);
      const [draft] = createLocalSuggestions({
        days: [date],
        meals: others,
        fridge: state.fridge,
        lastEaten,
        seed: input.seed,
        dishes: state.dishes.filter((dish) => dish.id !== current?.dishId),
        profiles: state.profiles,
        globalExclusions: state.settings.globalExclusions,
      });
      if (!draft?.dishId) {
        throw new ApiRequestError(422, "no_suggestion", "Jeg kunne ikke finde et forslag til den dag.");
      }
      const next: Meal = {
        dishId: draft.dishId,
        locked: false,
        note: current?.note ?? "",
        source: "local",
        reason: draft.reason,
      };
      state.meals[date] = next;
      emit(["meals"]);
      return structuredClone(next);
    },

    async getShopping(query) {
      await wait();
      return buildShopping(query);
    },
    toggleShoppingItem: (itemId) => shoppingMutation((current) => toggleChecked(current, itemId))(),
    addShoppingExtra: (label) =>
      shoppingMutation((current) =>
        current.extras.some((extra) => extraItemId(extra.label) === extraItemId(label))
          ? current
          : addExtra(current, label),
      )(),
    removeShoppingExtra: (itemId) =>
      shoppingMutation((current) => {
        const extra = current.extras.find((candidate) => extraItemId(candidate.label) === itemId);
        if (!extra) throw NOT_FOUND();
        return removeExtra(current, extra.label);
      })(),
    resetShopping: shoppingMutation(() => EMPTY_SHOPPING_STATE),

    async putFridge(items) {
      await wait();
      state.fridge = items;
      emit(["household", "shopping"]);
      return items;
    },
    async putPantry(items) {
      await wait();
      state.pantry = items;
      emit(["household", "shopping"]);
      return items;
    },
    async putProfiles(profiles) {
      await wait();
      state.profiles = profiles;
      emit(["household"]);
      return profiles;
    },
    async putSettings(settings) {
      await wait();
      state.settings = settings;
      emit(["settings"]);
      return settings;
    },

    ...createFakeAssist({
      state,
      today,
      wait,
      emit,
      addShoppingExtra: (label) => {
        if (!shoppingState.extras.some((extra) => extraItemId(extra.label) === extraItemId(label))) {
          shoppingState = addExtra(shoppingState, label);
          emit(["shopping"]);
        }
      },
    }),
    ...createFakeLibrary({ state, wait, emit, onImported: () => (isEmptyDb = false) }),
    ...createFakeDrafts({ state, today, openai: options.openai === true, wait, emit, aiDelayMs: options.aiDelayMs ?? 1500 }),

    subscribe(handlers) {
      listeners.add(handlers);
      handlers.onConnection(true);
      return () => listeners.delete(handlers);
    },
  };
}
