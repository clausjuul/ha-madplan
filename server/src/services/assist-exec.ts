/** Executes confirmed Assist actions: re-checked one by one, written in ONE transaction, undoable for a while. */
import { randomUUID } from "node:crypto";
import { extraItemId } from "@madplan/domain";
import type {
  AssistAction,
  AssistActionResult,
  ChangeTopic,
  Dish,
  FridgeItem,
  Meal,
  Profile,
  Settings,
  ShoppingListState,
} from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { HttpError, notFound } from "../errors.ts";
import { one, run, text, toJson } from "../repo.ts";
import { findDish, saveDish } from "../store-dishes.ts";
import {
  getFridge,
  getPantry,
  getProfiles,
  getSettings,
  getShoppingState,
  setFridge,
  setPantry,
  setProfiles,
  setSettings,
  setShoppingState,
} from "../store-household.ts";
import { deleteMeal, getMeal, putMeal } from "../store-meals.ts";
import { createDraft } from "./drafts.ts";
import { checkAction, envFromDb } from "./assist-actions.ts";
import { EXTRA_TOPICS, rememberExtra, writeExtra } from "./assist-exec-extra.ts";

const TOPICS: Record<AssistAction["type"], ChangeTopic[]> = {
  setMeal: ["meals", "shopping"],
  removeMeal: ["meals", "shopping"],
  swapMeals: ["meals", "shopping"],
  lockMeal: ["meals"],
  addShoppingExtra: ["shopping"],
  addFridgeItem: ["household", "shopping"],
  removeFridgeItem: ["household", "shopping"],
  addGlobalExclusion: ["settings"],
  updateProfile: ["household", "shopping"],
  createDish: ["dishes", "shopping"],
  startPlanDraft: [],
  removeShoppingExtra: ["shopping"],
  setMealNote: ["meals"],
  skipMeal: ["meals", "shopping"],
  rateMeal: ["meals"],
  setMealVariant: ["meals", "shopping"],
  setDishImage: ["dishes"],
  ...EXTRA_TOPICS,
};

/** What the data looked like before an apply, for exactly the parts the actions can touch. */
type Before = {
  meals: Record<string, Meal | null>;
  fridge?: FridgeItem[];
  settings?: Settings;
  profiles?: Profile[];
  shopping?: ShoppingListState;
  /** Dishes as they were before a change to an existing dish (e.g. its photo). */
  dishes?: Record<string, Dish>;
  pantry?: string[];
  createdDishIds: string[];
};

function remember(deps: Deps, before: Before, action: AssistAction): void {
  const db = deps.repo.db;
  const meal = (date: string): void => {
    if (!(date in before.meals)) before.meals[date] = getMeal(db, date) ?? null;
  };
  switch (action.type) {
    case "setMeal":
    case "removeMeal":
    case "lockMeal":
    case "setMealNote":
    case "skipMeal":
    case "rateMeal":
    case "setMealVariant":
      meal(action.date);
      return;
    case "swapMeals":
      meal(action.a);
      meal(action.b);
      return;
    case "addShoppingExtra":
    case "removeShoppingExtra":
      before.shopping ??= getShoppingState(db);
      return;
    case "addFridgeItem":
    case "removeFridgeItem":
      before.fridge ??= getFridge(db);
      return;
    case "addGlobalExclusion":
      before.settings ??= getSettings(db);
      return;
    case "updateProfile":
      before.profiles ??= getProfiles(db);
      return;
    case "setDishImage": {
      const dish = findDish(db, action.dishId);
      before.dishes ??= {};
      if (dish && !(action.dishId in before.dishes)) before.dishes[action.dishId] = dish;
      return;
    }
    case "createDish":
    case "startPlanDraft":
      return;
    default:
      rememberExtra(db, before, action);
  }
}

function write(deps: Deps, action: AssistAction, before: Before): void {
  const db = deps.repo.db;
  switch (action.type) {
    case "setMeal": {
      const existing = getMeal(db, action.date);
      const meal: Meal = {
        dishId: action.dishId,
        locked: false,
        note: existing?.note ?? "",
        source: "manual",
        reason: "Foreslået af Assist.",
      };
      putMeal(db, action.date, meal);
      return;
    }
    case "removeMeal":
      deleteMeal(db, action.date);
      return;
    case "swapMeals": {
      const first = getMeal(db, action.a);
      const second = getMeal(db, action.b);
      if (second) putMeal(db, action.a, second);
      else deleteMeal(db, action.a);
      if (first) putMeal(db, action.b, first);
      else deleteMeal(db, action.b);
      return;
    }
    case "lockMeal": {
      const existing = getMeal(db, action.date);
      if (existing) putMeal(db, action.date, { ...existing, locked: action.locked });
      return;
    }
    case "addShoppingExtra": {
      const state = getShoppingState(db);
      if (!state.extras.some((extra) => extraItemId(extra.label) === extraItemId(action.item))) {
        setShoppingState(db, { ...state, extras: [...state.extras, { label: action.item }] });
      }
      return;
    }
    case "removeShoppingExtra": {
      const state = getShoppingState(db);
      const id = extraItemId(action.item);
      setShoppingState(db, { ...state, extras: state.extras.filter((extra) => extraItemId(extra.label) !== id) });
      return;
    }
    case "addFridgeItem": {
      const item = {
        name: action.name,
        ...(action.quantity ? { quantity: action.quantity } : {}),
        ...(action.expiresOn ? { expiresOn: action.expiresOn } : {}),
      };
      const key = action.name.trim().toLocaleLowerCase("da-DK");
      const kept = getFridge(db).filter((entry) => entry.name.trim().toLocaleLowerCase("da-DK") !== key);
      setFridge(db, [...kept, item]);
      return;
    }
    case "removeFridgeItem": {
      const key = action.name.trim().toLocaleLowerCase("da-DK");
      setFridge(db, getFridge(db).filter((entry) => entry.name.trim().toLocaleLowerCase("da-DK") !== key));
      return;
    }
    case "addGlobalExclusion": {
      const settings = getSettings(db);
      setSettings(db, { ...settings, globalExclusions: [...settings.globalExclusions, action.term.trim()] });
      return;
    }
    case "updateProfile": {
      const key = action.term.trim().toLocaleLowerCase("da-DK");
      setProfiles(
        db,
        getProfiles(db).map((profile) => {
          if (profile.id !== action.profileId) return profile;
          const kept = (profile[action.field] ?? []).filter((entry) => entry.trim().toLocaleLowerCase("da-DK") !== key);
          return { ...profile, [action.field]: action.remove ? kept : [...kept, action.term.trim()] };
        }),
      );
      return;
    }
    case "createDish": {
      const dish: Dish = { ...action.dish, id: `custom-${randomUUID()}`, custom: true, generated: true };
      saveDish(db, dish);
      before.createdDishIds.push(dish.id);
      return;
    }
    case "setDishImage": {
      const dish = findDish(db, action.dishId);
      if (!dish) return;
      const { imageKey: _bundled, ...rest } = dish;
      saveDish(db, { ...rest, imageUrl: action.imageUrl });
      return;
    }
    case "setMealNote": {
      const existing = getMeal(db, action.date);
      if (existing) putMeal(db, action.date, { ...existing, note: action.note });
      return;
    }
    case "skipMeal": {
      const existing = getMeal(db, action.date);
      if (!existing) return;
      const { skipped: _skipped, ...rest } = existing;
      putMeal(db, action.date, action.skipped ? { ...rest, skipped: true } : rest);
      return;
    }
    case "setMealVariant": {
      const existing = getMeal(db, action.date);
      if (!existing) return;
      const others = (existing.variants ?? []).filter((variant) => variant.profileId !== action.profileId);
      const variants = action.remove
        ? others
        : [...others, { profileId: action.profileId, replaces: action.replaces, with: action.with }];
      const { variants: _variants, ...rest } = existing;
      putMeal(db, action.date, variants.length ? { ...rest, variants } : rest);
      return;
    }
    case "rateMeal": {
      const existing = getMeal(db, action.date);
      if (!existing) return;
      const { rating: _rating, ...rest } = existing;
      putMeal(db, action.date, action.rating ? { ...rest, rating: action.rating } : rest);
      return;
    }
    case "startPlanDraft":
      return;
    default:
      writeExtra(db, action, deps.now().toISOString());
  }
}

export const UNDO_TTL_MS = 10 * 60 * 1000;
/** `after` is how the touched data looked right after the apply; undo is only safe while it still looks like that. */
type UndoRecord = { before: Before; after: string };

/**
 * The current state of exactly what an apply touched (the same days, the same lists, the same dishes),
 * as a string to compare. Changes elsewhere (a tick on the shopping list, another day) do not move it.
 */
function touchedState(deps: Deps, before: Before): string {
  const db = deps.repo.db;
  const dishIds = [...Object.keys(before.dishes ?? {}), ...before.createdDishIds].sort();
  return toJson({
    meals: Object.keys(before.meals)
      .sort()
      .map((date) => [date, getMeal(db, date) ?? null]),
    fridge: before.fridge ? getFridge(db) : null,
    pantry: before.pantry ? getPantry(db) : null,
    settings: before.settings ? getSettings(db) : null,
    profiles: before.profiles ? getProfiles(db) : null,
    shopping: before.shopping ? getShoppingState(db) : null,
    dishes: dishIds.map((id) => [id, findDish(db, id) ?? null]),
  });
}

export type ApplyOutcome = { results: AssistActionResult[]; undoId?: string };

/**
 * Runs the chosen actions in order (all when `only` is omitted). Actions that fail their check are
 * skipped (and reported), the rest are committed together. A plan draft is started afterwards because
 * it manages its own transaction. The data before the change is kept so the user can undo it.
 */
export function applyActions(deps: Deps, actions: readonly AssistAction[], only?: readonly number[]): ApplyOutcome {
  const chosen = new Set(only ?? actions.map((_, index) => index));
  const results: AssistActionResult[] = actions.map((action, index) =>
    chosen.has(index) ? { label: action.label, ok: false } : { label: action.label, ok: false, message: "Fravalgt." },
  );
  const transactional = actions.flatMap((action, index) => (action.type !== "startPlanDraft" && chosen.has(index) ? [index] : []));
  const before: Before = { meals: {}, createdDishIds: [] };
  let wrote = false;
  if (transactional.length > 0) {
    const topics = transactional.flatMap((index) => TOPICS[actions[index]!.type]);
    deps.repo.mutate(topics, () => {
      for (const index of transactional) {
        const action = actions[index];
        if (!action) continue;
        const problem = checkAction(envFromDb(deps), action);
        if (problem) {
          results[index] = { label: action.label, ok: false, message: problem };
          continue;
        }
        remember(deps, before, action);
        write(deps, action, before);
        wrote = true;
        results[index] = { label: action.label, ok: true };
      }
    });
  }
  // Recorded right after the commit, before a plan draft (which is not undone) runs.
  const undoId = wrote ? saveUndo(deps, { before, after: touchedState(deps, before) }) : undefined;
  actions.forEach((action, index) => {
    if (action.type !== "startPlanDraft" || !chosen.has(index)) return;
    const problem = checkAction(envFromDb(deps), action);
    if (problem) {
      results[index] = { label: action.label, ok: false, message: problem };
      return;
    }
    try {
      createDraft(deps, action.request);
      results[index] = { label: action.label, ok: true };
    } catch (error) {
      const message = error instanceof HttpError ? error.message : "Planudkastet kunne ikke startes.";
      results[index] = { label: action.label, ok: false, message };
    }
  });
  return { results, ...(undoId ? { undoId } : {}) };
}

function saveUndo(deps: Deps, record: UndoRecord): string {
  const { db } = deps.repo;
  const now = deps.now();
  run(db, "DELETE FROM assist_undo WHERE expires_at <= ?", now.toISOString());
  const id = randomUUID();
  run(db, "INSERT INTO assist_undo (id, json, expires_at) VALUES (?, ?, ?)", id, toJson(record), new Date(now.getTime() + UNDO_TTL_MS).toISOString());
  return id;
}

/**
 * Puts back what an apply changed. Refused when the same data was changed since (by anyone), so an
 * undo can never overwrite someone's later edit; changes to other days or lists do not block it.
 */
export function undoApply(deps: Deps, id: string): void {
  const { db } = deps.repo;
  const row = one(db, "SELECT json, expires_at FROM assist_undo WHERE id = ?", id);
  if (!row || text(row, "expires_at") <= deps.now().toISOString()) {
    run(db, "DELETE FROM assist_undo WHERE id = ?", id);
    throw notFound("Det er for sent at fortryde. Ret det selv, eller bed Assist om det.");
  }
  const { before, after } = JSON.parse(text(row, "json")) as UndoRecord;
  if (touchedState(deps, before) !== after) {
    throw new HttpError(409, "changed", "Der er ændret noget siden, så Assist kan ikke fortryde sikkert. Ret det selv.");
  }
  const topics: ChangeTopic[] = ["meals", "shopping"];
  if (before.fridge || before.profiles || before.pantry) topics.push("household");
  if (before.settings) topics.push("settings");
  if (before.createdDishIds.length > 0 || before.dishes) topics.push("dishes");
  deps.repo.mutate(topics, () => {
    for (const [date, meal] of Object.entries(before.meals)) {
      if (meal) putMeal(db, date, meal);
      else deleteMeal(db, date);
    }
    if (before.fridge) setFridge(db, before.fridge);
    if (before.pantry) setPantry(db, before.pantry);
    if (before.settings) setSettings(db, before.settings);
    if (before.profiles) setProfiles(db, before.profiles);
    if (before.shopping) setShoppingState(db, before.shopping);
    for (const dish of Object.values(before.dishes ?? {})) saveDish(db, dish);
    for (const dishId of before.createdDishIds) {
      const dish = findDish(db, dishId);
      if (dish && !dish.archivedAt) saveDish(db, { ...dish, archivedAt: deps.now().toISOString() });
    }
    run(db, "DELETE FROM assist_undo WHERE id = ?", id);
  });
}
