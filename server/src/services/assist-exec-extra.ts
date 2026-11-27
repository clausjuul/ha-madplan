/** Writes for the second batch of Assist actions (see assist-actions-extra.ts). Runs inside assist-exec's transaction. */
import { randomUUID } from "node:crypto";
import { addDaysToKey, daysBetween, extraItemId, normalizeItem } from "@madplan/domain";
import type { AssistAction, ChangeTopic, Dish, Meal, Profile } from "@madplan/domain";
import type { DatabaseSync } from "node:sqlite";
import { findDish, saveDish } from "../store-dishes.ts";
import {
  getPantry,
  getProfiles,
  getSettings,
  getShoppingState,
  setPantry,
  setProfiles,
  setSettings,
  setShoppingState,
} from "../store-household.ts";
import { deleteMeal, getMeal, putMeal } from "../store-meals.ts";
import type { ExtraActionType } from "./assist-actions-extra.ts";

type ExtraAction = Extract<AssistAction, { type: ExtraActionType }>;

export const EXTRA_TOPICS: Record<ExtraActionType, ChangeTopic[]> = {
  updateDish: ["dishes", "shopping"],
  archiveDish: ["dishes", "shopping"],
  clearMeals: ["meals", "shopping"],
  copyMeals: ["meals", "shopping"],
  moveMeals: ["meals", "shopping"],
  addDishToShopping: ["shopping"],
  checkShoppingItems: ["shopping"],
  resetShopping: ["shopping"],
  addPantryItem: ["household", "shopping"],
  removePantryItem: ["household", "shopping"],
  setPreferredStores: ["settings", "shopping"],
  setServings: ["settings", "shopping"],
  watchOffer: ["settings"],
  addProfile: ["household", "shopping"],
  removeProfile: ["household", "shopping"],
  setProfileActive: ["household", "shopping"],
  setProfilePortions: ["household", "shopping"],
};

/** The parts of Before (assist-exec.ts) these actions touch. */
export type ExtraBefore = {
  meals: Record<string, Meal | null>;
  dishes?: Record<string, Dish>;
  pantry?: string[];
  settings?: ReturnType<typeof getSettings>;
  profiles?: Profile[];
  shopping?: ReturnType<typeof getShoppingState>;
};

const datesIn = (from: string, to: string): string[] =>
  Array.from({ length: daysBetween(from, to) + 1 }, (_, index) => addDaysToKey(from, index));
const same = (a: string, b: string): boolean => normalizeItem(a) === normalizeItem(b);

export function rememberExtra(db: DatabaseSync, before: ExtraBefore, action: ExtraAction): void {
  const meal = (date: string): void => {
    if (!(date in before.meals)) before.meals[date] = getMeal(db, date) ?? null;
  };
  const dish = (id: string): void => {
    before.dishes ??= {};
    const found = findDish(db, id);
    if (found && !(id in before.dishes)) before.dishes[id] = found;
  };
  switch (action.type) {
    case "updateDish":
    case "archiveDish":
      dish(action.dishId);
      return;
    case "clearMeals":
      datesIn(action.from, action.to).forEach(meal);
      return;
    case "copyMeals":
      for (let index = 0; index < action.dayCount; index += 1) meal(addDaysToKey(action.targetFrom, index));
      return;
    case "moveMeals":
      for (const date of datesIn(action.from, action.to)) {
        meal(date);
        meal(addDaysToKey(date, action.days));
      }
      return;
    case "addDishToShopping":
    case "checkShoppingItems":
    case "resetShopping":
      before.shopping ??= getShoppingState(db);
      return;
    case "addPantryItem":
    case "removePantryItem":
      before.pantry ??= getPantry(db);
      return;
    case "setPreferredStores":
    case "setServings":
    case "watchOffer":
      before.settings ??= getSettings(db);
      return;
    case "addProfile":
    case "removeProfile":
    case "setProfileActive":
    case "setProfilePortions":
      before.profiles ??= getProfiles(db);
      return;
  }
}

function updateProfile(db: DatabaseSync, id: string, change: (profile: Profile) => Profile): void {
  setProfiles(db, getProfiles(db).map((profile) => (profile.id === id ? change(profile) : profile)));
}

export function writeExtra(db: DatabaseSync, action: ExtraAction, nowIso: string): void {
  switch (action.type) {
    case "updateDish": {
      const dish = findDish(db, action.dishId);
      if (!dish) return;
      saveDish(db, { ...dish, ...action.changes, custom: true });
      return;
    }
    case "archiveDish": {
      const dish = findDish(db, action.dishId);
      if (!dish) return;
      const { archivedAt: _was, ...rest } = dish;
      saveDish(db, action.archived ? { ...rest, archivedAt: nowIso } : rest);
      return;
    }
    case "clearMeals":
      for (const date of datesIn(action.from, action.to)) {
        if (getMeal(db, date) && !getMeal(db, date)?.locked) deleteMeal(db, date);
      }
      return;
    case "copyMeals":
      for (let index = 0; index < action.dayCount; index += 1) {
        const source = getMeal(db, addDaysToKey(action.sourceFrom, index));
        const target = addDaysToKey(action.targetFrom, index);
        if (!source || getMeal(db, target)?.locked) continue;
        putMeal(db, target, { dishId: source.dishId, locked: false, note: "", source: "manual", reason: "Kopieret af Assist." });
      }
      return;
    case "moveMeals": {
      const moving = datesIn(action.from, action.to).flatMap((date) => {
        const meal = getMeal(db, date);
        return meal ? [{ date, meal }] : [];
      });
      for (const { date } of moving) deleteMeal(db, date);
      for (const { date, meal } of moving) putMeal(db, addDaysToKey(date, action.days), meal);
      return;
    }
    case "addDishToShopping": {
      const state = getShoppingState(db);
      const extras = [...state.extras];
      for (const item of action.items) {
        if (!extras.some((extra) => extraItemId(extra.label) === extraItemId(item))) extras.push({ label: item });
      }
      setShoppingState(db, { ...state, extras });
      return;
    }
    case "checkShoppingItems": {
      const state = getShoppingState(db);
      const others = state.checked.filter((id) => !action.itemIds.includes(id));
      setShoppingState(db, { ...state, checked: action.checked ? [...others, ...action.itemIds] : others });
      return;
    }
    case "resetShopping":
      setShoppingState(db, { checked: [], extras: [] });
      return;
    case "addPantryItem":
      setPantry(db, [...getPantry(db), action.name.trim()]);
      return;
    case "removePantryItem":
      setPantry(db, getPantry(db).filter((name) => !same(name, action.name)));
      return;
    case "setPreferredStores":
      setSettings(db, { ...getSettings(db), preferredStores: action.stores });
      return;
    case "setServings": {
      const { preferredServings: _was, ...rest } = getSettings(db);
      setSettings(db, action.servings ? { ...rest, preferredServings: action.servings } : rest);
      return;
    }
    case "watchOffer": {
      const settings = getSettings(db);
      const kept = (settings.offerWatchlist ?? []).filter((item) => !same(item.name, action.name));
      setSettings(db, { ...settings, offerWatchlist: action.remove ? kept : [...kept, { name: action.name.trim() }] });
      return;
    }
    case "addProfile":
      setProfiles(db, [
        ...getProfiles(db),
        {
          id: `profile-${randomUUID()}`,
          name: action.name.trim(),
          active: true,
          exclusions: [],
          preferences: [],
          dislikes: [],
          favoriteDishIds: [],
          ...(action.portions ? { portions: action.portions } : {}),
        },
      ]);
      return;
    case "removeProfile":
      setProfiles(db, getProfiles(db).filter((profile) => profile.id !== action.profileId));
      return;
    case "setProfileActive":
      updateProfile(db, action.profileId, (profile) => ({ ...profile, active: action.active }));
      return;
    case "setProfilePortions":
      updateProfile(db, action.profileId, (profile) => {
        const { portions: _was, ...rest } = profile;
        return action.portions ? { ...rest, portions: action.portions } : rest;
      });
      return;
  }
}
