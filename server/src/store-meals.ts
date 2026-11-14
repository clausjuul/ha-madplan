import type { DatabaseSync } from "node:sqlite";
import type { Meal, MealMap, MealSource, MealVariant, OfferReference } from "@madplan/domain";
import { all, flag, one, optText, parseJson, run, text, toJson } from "./repo.ts";
import type { Row } from "./repo.ts";

function toMeal(row: Row): Meal {
  const meal: Meal = {
    dishId: text(row, "dish_id"),
    locked: flag(row, "locked"),
    note: text(row, "note"),
    source: text(row, "source") as MealSource,
  };
  const reason = optText(row, "reason");
  if (reason) meal.reason = reason;
  const offer = parseJson<OfferReference | null>(row, "offer", null);
  if (offer) meal.offer = offer;
  if (flag(row, "skipped")) meal.skipped = true;
  const rating = optText(row, "rating");
  if (rating === "up" || rating === "down" || rating === "never") meal.rating = rating;
  const variants = parseJson<MealVariant[] | null>(row, "variants", null);
  if (variants?.length) meal.variants = variants;
  return meal;
}

export function getMeals(db: DatabaseSync): MealMap {
  const meals: MealMap = {};
  for (const row of all(db, "SELECT * FROM meals ORDER BY date")) meals[text(row, "date")] = toMeal(row);
  return meals;
}

export function getMeal(db: DatabaseSync, date: string): Meal | undefined {
  const row = one(db, "SELECT * FROM meals WHERE date = ?", date);
  return row ? toMeal(row) : undefined;
}

export function putMeal(db: DatabaseSync, date: string, meal: Meal): void {
  run(
    db,
    `INSERT INTO meals (date, dish_id, locked, note, source, reason, offer, skipped, rating, variants)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET dish_id = excluded.dish_id, locked = excluded.locked,
       note = excluded.note, source = excluded.source, reason = excluded.reason,
       offer = excluded.offer, skipped = excluded.skipped, rating = excluded.rating,
       variants = excluded.variants`,
    date,
    meal.dishId,
    meal.locked ? 1 : 0,
    meal.note,
    meal.source,
    meal.reason ?? null,
    meal.offer ? toJson(meal.offer) : null,
    meal.skipped ? 1 : 0,
    meal.rating ?? null,
    meal.variants?.length ? toJson(meal.variants) : null,
  );
}

export function deleteMeal(db: DatabaseSync, date: string): void {
  run(db, "DELETE FROM meals WHERE date = ?", date);
}
