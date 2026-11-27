import type { DatabaseSync } from "node:sqlite";
import { LEGACY_DISHES, cleanIngredientLine } from "@madplan/domain";
import type { Dish } from "@madplan/domain";
import { all, flag, one, optNumeric, optText, parseJson, run, text, numeric, toJson } from "./repo.ts";
import type { Row } from "./repo.ts";

function toDish(row: Row): Dish {
  const dish: Dish = {
    id: text(row, "id"),
    name: text(row, "name"),
    ingredients: parseJson<string[]>(row, "ingredients", []),
    prepMinutes: numeric(row, "prep_minutes"),
    category: text(row, "category"),
    favorite: flag(row, "favorite"),
    leftoverFriendly: flag(row, "leftover_friendly"),
    freezerFriendly: flag(row, "freezer_friendly"),
  };
  const servings = optNumeric(row, "servings");
  if (servings !== undefined) dish.servings = servings;
  const imageKey = optText(row, "image_key");
  if (imageKey) dish.imageKey = imageKey;
  const imageUrl = optText(row, "image_url");
  if (imageUrl) dish.imageUrl = imageUrl;
  const sourceUrl = optText(row, "source_url");
  if (sourceUrl) dish.sourceUrl = sourceUrl;
  const instructions = parseJson<string[] | null>(row, "instructions", null);
  if (instructions) dish.instructions = instructions;
  if (flag(row, "custom")) dish.custom = true;
  if (flag(row, "generated")) dish.generated = true;
  const archivedAt = optText(row, "archived_at");
  if (archivedAt) dish.archivedAt = archivedAt;
  return dish;
}

/** The household's dishes, in the order they were added. */
export function allDishes(db: DatabaseSync): Dish[] {
  return all(db, "SELECT * FROM dishes ORDER BY rowid").map(toDish);
}

export function findDish(db: DatabaseSync, id: string): Dish | undefined {
  const row = one(db, "SELECT * FROM dishes WHERE id = ?", id);
  return row ? toDish(row) : undefined;
}

export function saveDish(db: DatabaseSync, dish: Dish): void {
  run(
    db,
    `INSERT INTO dishes (id, name, ingredients, servings, prep_minutes, category, favorite,
       leftover_friendly, freezer_friendly, image_key, image_url, source_url, instructions,
       custom, generated, archived_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, ingredients = excluded.ingredients,
       servings = excluded.servings, prep_minutes = excluded.prep_minutes, category = excluded.category,
       favorite = excluded.favorite, leftover_friendly = excluded.leftover_friendly,
       freezer_friendly = excluded.freezer_friendly, image_key = excluded.image_key,
       image_url = excluded.image_url, source_url = excluded.source_url,
       instructions = excluded.instructions, custom = excluded.custom,
       generated = excluded.generated, archived_at = excluded.archived_at`,
    dish.id,
    dish.name,
    toJson(dish.ingredients),
    dish.servings ?? null,
    dish.prepMinutes,
    dish.category,
    dish.favorite ? 1 : 0,
    dish.leftoverFriendly ? 1 : 0,
    dish.freezerFriendly ? 1 : 0,
    dish.imageKey ?? null,
    dish.imageUrl ?? null,
    dish.sourceUrl ?? null,
    dish.instructions ? toJson(dish.instructions) : null,
    dish.custom ? 1 : 0,
    dish.generated ? 1 : 0,
    dish.archivedAt ?? null,
  );
}

/**
 * Tidies ingredient and step lines of dishes imported from the web (doubled parentheses, HTML
 * entities) the same way new imports are cleaned. Idempotent; returns how many dishes changed.
 */
export function tidyImportedDishes(db: DatabaseSync): number {
  let changed = 0;
  for (const dish of allDishes(db)) {
    if (!dish.sourceUrl) continue;
    const ingredients = dish.ingredients.map(cleanIngredientLine).filter(Boolean);
    const instructions = dish.instructions?.map(cleanIngredientLine).filter(Boolean);
    const same =
      ingredients.join("\n") === dish.ingredients.join("\n") &&
      (instructions ?? []).join("\n") === (dish.instructions ?? []).join("\n");
    if (same) continue;
    saveDish(db, { ...dish, ingredients, ...(instructions ? { instructions } : {}) });
    changed += 1;
  }
  return changed;
}

const RETIRED_KEY = "builtin_dishes_retired";

/**
 * The app used to ship built-in dishes that lived in code, not in the database. Once per database:
 * an installation that was already in use gets every one of them stored as an archived dish of its
 * own (keeping any edits), so meals, history and favourites that point at them still resolve and the
 * household can restore the ones it wants. A new, empty database starts without dishes. Returns how
 * many dishes were archived.
 */
export function retireBuiltinDishes(db: DatabaseSync, now: string): number {
  if (one(db, "SELECT 1 FROM meta WHERE key = ?", RETIRED_KEY)) return 0;
  const inUse = ["meals", "dishes", "profiles", "fridge_items", "pantry", "saved_inspirations"].some((table) => one(db, `SELECT 1 FROM ${table} LIMIT 1`));
  let archived = 0;
  if (inUse) {
    for (const builtIn of LEGACY_DISHES) {
      const dish = findDish(db, builtIn.id) ?? builtIn;
      saveDish(db, { ...dish, custom: true, archivedAt: dish.archivedAt ?? now });
      archived += 1;
    }
  }
  run(db, "INSERT INTO meta (key, value) VALUES (?, ?)", RETIRED_KEY, now);
  return archived;
}
