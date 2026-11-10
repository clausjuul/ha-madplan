import type { DatabaseSync } from "node:sqlite";
import { DISHES } from "@madplan/domain";
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

/** Rows only: custom dishes plus overrides of built-ins. */
export function storedDishes(db: DatabaseSync): Dish[] {
  return all(db, "SELECT * FROM dishes ORDER BY rowid").map(toDish);
}

/** Built-in catalog with stored overrides applied, followed by custom dishes. */
export function allDishes(db: DatabaseSync): Dish[] {
  const stored = storedDishes(db);
  const overrides = new Map(stored.map((dish) => [dish.id, dish]));
  const builtinIds = new Set(DISHES.map((dish) => dish.id));
  return [
    ...DISHES.map((dish) => overrides.get(dish.id) ?? dish),
    ...stored.filter((dish) => !builtinIds.has(dish.id)),
  ];
}

export function findDish(db: DatabaseSync, id: string): Dish | undefined {
  const row = one(db, "SELECT * FROM dishes WHERE id = ?", id);
  if (row) return toDish(row);
  return DISHES.find((dish) => dish.id === id);
}

export function isBuiltinDish(id: string): boolean {
  return DISHES.some((dish) => dish.id === id);
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
