import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import type { Dish } from "@madplan/domain";
import { markReviewed } from "../ai/recipe-review.ts";
import type { Deps } from "../deps.ts";
import { notFound } from "../errors.ts";
import { readJson } from "../http.ts";
import { draftDishPreview, readDish } from "../services/dish-reading.ts";
import { findDish, saveDish } from "../store-dishes.ts";
import { deletePhotoAt, getPhoto, savePhoto } from "../store-photos.ts";
import { dishDraftInput, dishInput, dishReadInput } from "../validate.ts";

/** Up to three downscaled photos as data: URLs. */
const MAX_READ_BYTES = 16_000_000;
/** A dish with an uploaded photo (a data: URL). */
const MAX_DISH_BYTES = 4_000_000;

export function dishRoutes(api: Hono, deps: Deps): void {
  const { repo } = deps;

  const need = (id: string): Dish => {
    const dish = findDish(repo.db, id);
    if (!dish) throw notFound("Retten findes ikke.");
    return dish;
  };

  const store = (dish: Dish): Dish => repo.mutate(["dishes", "shopping"], () => (saveDish(repo.db, dish), dish));

  /** Saves the dish; an uploaded photo is stored on its own and replaced by its link. */
  const storeWithPhoto = (dish: Dish, previousImage?: string): Dish =>
    repo.mutate(["dishes", "shopping"], () => {
      const saved = dish.imageUrl?.startsWith("data:") ? { ...dish, imageUrl: savePhoto(repo.db, dish.imageUrl, deps.now().toISOString()) } : dish;
      if (previousImage !== saved.imageUrl) deletePhotoAt(repo.db, previousImage);
      saveDish(repo.db, saved);
      return saved;
    });

  api.get("/photos/:id", (c) => {
    const photo = getPhoto(repo.db, c.req.param("id"));
    if (!photo) throw notFound("Billedet findes ikke.");
    return c.body(new Uint8Array(photo.data), 200, {
      "Content-Type": photo.mime,
      // A photo never changes: a new one gets a new id.
      "Cache-Control": "private, max-age=31536000, immutable",
    });
  });

  api.post("/dishes", async (c) => {
    const input = dishInput(await readJson(c, MAX_DISH_BYTES));
    const dish: Dish = { ...input, id: `custom-${randomUUID()}`, custom: true };
    // A recipe from a link was checked (or read by AI) on the way in, and the family has seen it in the
    // form since; the startup check of older imports must not rewrite it.
    if (dish.sourceUrl) markReviewed(repo.db, dish.id);
    return c.json(storeWithPhoto(dish));
  });

  // Previews for the form: nothing is saved until the family presses "Gem" (POST /dishes).
  api.post("/dishes/read", async (c) => {
    const input = dishReadInput(await readJson(c, MAX_READ_BYTES));
    return c.json(await readDish(deps, input, AbortSignal.timeout(90_000)));
  });

  api.post("/dishes/draft", async (c) => {
    const input = dishDraftInput(await readJson(c));
    return c.json(await draftDishPreview(deps, input, AbortSignal.timeout(60_000)));
  });

  api.put("/dishes/:id", async (c) => {
    const existing = need(c.req.param("id"));
    const input = dishInput(await readJson(c, MAX_DISH_BYTES));
    const dish: Dish = { ...input, id: existing.id, custom: true };
    if (existing.archivedAt) dish.archivedAt = existing.archivedAt;
    return c.json(storeWithPhoto(dish, existing.imageUrl));
  });

  api.post("/dishes/:id/archive", (c) => {
    const existing = need(c.req.param("id"));
    return c.json(store({ ...existing, archivedAt: existing.archivedAt ?? deps.now().toISOString() }));
  });

  api.post("/dishes/:id/restore", (c) => {
    const { archivedAt: _removed, ...rest } = need(c.req.param("id"));
    return c.json(store(rest));
  });
}
