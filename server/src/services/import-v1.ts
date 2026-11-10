import { dateKey, legacyWeekListId, migrateV1, parseDateKey, startOfWeek } from "@madplan/domain";
import { todayKey } from "../state.ts";
import type { ImportResult } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { conflict, unprocessable } from "../errors.ts";
import { saveDish } from "../store-dishes.ts";
import {
  setFridge,
  setPantry,
  setProfiles,
  setSavedInspirations,
  setSettings,
  setShoppingState,
} from "../store-household.ts";
import { putMeal } from "../store-meals.ts";

/** Imports a stored v1 meal plan into an empty database, atomically. */
export function importV1(deps: Deps, body: unknown): ImportResult {
  const { repo } = deps;
  if (!repo.isEmpty()) {
    throw conflict("Databasen indeholder allerede data. Import er kun muligt i en tom Madplan.");
  }
  const now = deps.now();
  const migrated = migrateV1(body, { now: now.toISOString() });
  if (!migrated.ok) throw unprocessable(migrated.error);
  const { data, warnings } = migrated;
  const weekList = data.shoppingLists[legacyWeekListId(dateKey(startOfWeek(parseDateKey(todayKey(deps)))))];
  repo.mutate(["meals", "dishes", "household", "settings", "shopping", "inspirations"], () => {
    for (const [date, meal] of Object.entries(data.meals)) putMeal(repo.db, date, meal);
    for (const dish of data.dishes) saveDish(repo.db, dish);
    setProfiles(repo.db, data.profiles);
    setFridge(repo.db, data.fridge);
    setPantry(repo.db, data.pantry);
    setSettings(repo.db, data.settings);
    setShoppingState(repo.db, weekList ?? { checked: [], extras: [] });
    setSavedInspirations(repo.db, data.savedInspirations);
  });
  return {
    warnings,
    counts: {
      meals: Object.keys(data.meals).length,
      dishes: data.dishes.length,
      profiles: data.profiles.length,
    },
  };
}
