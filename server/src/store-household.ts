import type { DatabaseSync } from "node:sqlite";
import type {
  FridgeItem,
  InspirationRecipe,
  Profile,
  Settings,
  ShoppingListState,
} from "@madplan/domain";
import { all, flag, one, optNumeric, optText, parseJson, run, text, toJson } from "./repo.ts";

export function getProfiles(db: DatabaseSync): Profile[] {
  return all(db, "SELECT * FROM profiles ORDER BY position").map((row) => {
    const profile: Profile = {
      id: text(row, "id"),
      name: text(row, "name"),
      active: flag(row, "active"),
      exclusions: parseJson<string[]>(row, "exclusions", []),
      preferences: parseJson<string[]>(row, "preferences", []),
      dislikes: parseJson<string[]>(row, "dislikes", []),
      favoriteDishIds: parseJson<string[]>(row, "favorite_dish_ids", []),
    };
    const portions = optNumeric(row, "portions");
    if (portions !== undefined) profile.portions = portions;
    const safeFoods = parseJson<string[]>(row, "safe_foods", []);
    if (safeFoods.length) profile.safeFoods = safeFoods;
    return profile;
  });
}

export function setProfiles(db: DatabaseSync, profiles: readonly Profile[]): void {
  run(db, "DELETE FROM profiles");
  profiles.forEach((profile, position) => {
    run(
      db,
      `INSERT OR REPLACE INTO profiles (id, position, name, active, exclusions, preferences, dislikes,
         favorite_dish_ids, portions, safe_foods) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      profile.id,
      position,
      profile.name,
      profile.active ? 1 : 0,
      toJson(profile.exclusions),
      toJson(profile.preferences),
      toJson(profile.dislikes),
      toJson(profile.favoriteDishIds),
      profile.portions ?? null,
      profile.safeFoods?.length ? toJson(profile.safeFoods) : null,
    );
  });
}

export function getFridge(db: DatabaseSync): FridgeItem[] {
  return all(db, "SELECT * FROM fridge_items ORDER BY position").map((row) => {
    const item: FridgeItem = { name: text(row, "name") };
    const quantity = optText(row, "quantity");
    if (quantity) item.quantity = quantity;
    const expiresOn = optText(row, "expires_on");
    if (expiresOn) item.expiresOn = expiresOn;
    if (flag(row, "use_first")) item.useFirst = true;
    return item;
  });
}

export function setFridge(db: DatabaseSync, items: readonly FridgeItem[]): void {
  run(db, "DELETE FROM fridge_items");
  items.forEach((item, position) => {
    run(
      db,
      "INSERT INTO fridge_items (position, name, quantity, expires_on, use_first) VALUES (?, ?, ?, ?, ?)",
      position,
      item.name,
      item.quantity ?? null,
      item.expiresOn ?? null,
      item.useFirst ? 1 : 0,
    );
  });
}

export function getPantry(db: DatabaseSync): string[] {
  return all(db, "SELECT name FROM pantry ORDER BY position").map((row) => text(row, "name"));
}

export function setPantry(db: DatabaseSync, names: readonly string[]): void {
  run(db, "DELETE FROM pantry");
  names.forEach((name, position) => run(db, "INSERT INTO pantry (position, name) VALUES (?, ?)", position, name));
}

export const DEFAULT_SETTINGS: Settings = { globalExclusions: [], preferredStores: [] };

export function getSettings(db: DatabaseSync): Settings {
  const row = one(db, "SELECT data FROM settings WHERE id = 1");
  return row ? { ...DEFAULT_SETTINGS, ...parseJson<Partial<Settings>>(row, "data", {}) } : DEFAULT_SETTINGS;
}

export function setSettings(db: DatabaseSync, settings: Settings): void {
  run(
    db,
    "INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    toJson(settings),
  );
}

export function getShoppingState(db: DatabaseSync): ShoppingListState {
  const row = one(db, "SELECT * FROM shopping_state WHERE id = 1");
  if (!row) return { checked: [], extras: [] };
  return {
    checked: parseJson<string[]>(row, "checked", []),
    extras: parseJson<ShoppingListState["extras"]>(row, "extras", []),
  };
}

export function setShoppingState(db: DatabaseSync, state: ShoppingListState): void {
  run(
    db,
    `INSERT INTO shopping_state (id, checked, extras) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET checked = excluded.checked, extras = excluded.extras`,
    toJson(state.checked),
    toJson(state.extras),
  );
}

export function getSavedInspirations(db: DatabaseSync): InspirationRecipe[] {
  return all(db, "SELECT data FROM saved_inspirations ORDER BY position").map((row) =>
    parseJson<InspirationRecipe>(row, "data", {} as InspirationRecipe),
  );
}

export function setSavedInspirations(db: DatabaseSync, recipes: readonly InspirationRecipe[]): void {
  run(db, "DELETE FROM saved_inspirations");
  const seen = new Set<string>();
  for (const recipe of recipes) {
    if (seen.has(recipe.id)) continue;
    seen.add(recipe.id);
    run(
      db,
      "INSERT INTO saved_inspirations (position, id, data) VALUES (?, ?, ?)",
      seen.size,
      recipe.id,
      toJson(recipe),
    );
  }
}

// Discoveries (recipes already shown, so they are not offered again) ----------------------------

export type SeenRecipe = { identity: string; sourceUrl: string; name: string };

export function seenRecipes(db: DatabaseSync, limit = 400): SeenRecipe[] {
  return all(db, "SELECT identity, source_url, name FROM discoveries ORDER BY seen_at DESC, rowid DESC LIMIT ?", limit).map(
    (row) => ({ identity: text(row, "identity"), sourceUrl: text(row, "source_url"), name: text(row, "name") }),
  );
}

export function rememberRecipes(db: DatabaseSync, recipes: readonly SeenRecipe[], seenAt: string): void {
  for (const recipe of recipes) {
    run(
      db,
      "INSERT OR IGNORE INTO discoveries (identity, source_url, name, seen_at) VALUES (?, ?, ?, ?)",
      recipe.identity,
      recipe.sourceUrl,
      recipe.name,
      seenAt,
    );
  }
}
