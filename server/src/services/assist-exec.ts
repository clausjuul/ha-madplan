/** Executes confirmed Assist actions: re-checked one by one, written in ONE transaction. */
import { randomUUID } from "node:crypto";
import { extraItemId } from "@madplan/domain";
import type { AssistAction, AssistActionResult, ChangeTopic, Dish, Meal } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { HttpError } from "../errors.ts";
import { saveDish } from "../store-dishes.ts";
import {
  getFridge,
  getProfiles,
  getSettings,
  getShoppingState,
  setFridge,
  setProfiles,
  setSettings,
  setShoppingState,
} from "../store-household.ts";
import { deleteMeal, getMeal, putMeal } from "../store-meals.ts";
import { createDraft } from "./drafts.ts";
import { checkAction, envFromDb } from "./assist-actions.ts";

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
};

function write(deps: Deps, action: AssistAction): void {
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
          const kept = profile[action.field].filter((entry) => entry.trim().toLocaleLowerCase("da-DK") !== key);
          return { ...profile, [action.field]: action.remove ? kept : [...kept, action.term.trim()] };
        }),
      );
      return;
    }
    case "createDish": {
      const dish: Dish = { ...action.dish, id: `custom-${randomUUID()}`, custom: true, generated: true };
      saveDish(db, dish);
      return;
    }
    case "startPlanDraft":
      return;
  }
}

/**
 * Runs the actions in order. Actions that fail their check are skipped (and reported), the rest are
 * committed together. A plan draft is started afterwards because it manages its own transaction.
 */
export function applyActions(deps: Deps, actions: readonly AssistAction[]): AssistActionResult[] {
  const results: AssistActionResult[] = actions.map((action) => ({ label: action.label, ok: false }));
  const transactional = actions.flatMap((action, index) => (action.type === "startPlanDraft" ? [] : [index]));
  if (transactional.length > 0) {
    const topics = actions.flatMap((action) => TOPICS[action.type]);
    deps.repo.mutate(topics, () => {
      for (const index of transactional) {
        const action = actions[index];
        if (!action) continue;
        const problem = checkAction(envFromDb(deps), action);
        if (problem) {
          results[index] = { label: action.label, ok: false, message: problem };
          continue;
        }
        write(deps, action);
        results[index] = { label: action.label, ok: true };
      }
    });
  }
  actions.forEach((action, index) => {
    if (action.type !== "startPlanDraft") return;
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
  return results;
}
