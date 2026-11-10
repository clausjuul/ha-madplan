import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import type { Dish } from "@madplan/domain";
import { importRecipeFromUrl } from "../ai/recipe-import.ts";
import type { Deps } from "../deps.ts";
import { notFound } from "../errors.ts";
import { readJson } from "../http.ts";
import { findDish, isBuiltinDish, saveDish } from "../store-dishes.ts";
import { dishInput } from "../validate.ts";
import { rec, str } from "../validate-basic.ts";

export function dishRoutes(api: Hono, deps: Deps): void {
  const { repo } = deps;

  const need = (id: string): Dish => {
    const dish = findDish(repo.db, id);
    if (!dish) throw notFound("Retten findes ikke.");
    return dish;
  };

  const store = (dish: Dish): Dish => repo.mutate(["dishes", "shopping"], () => (saveDish(repo.db, dish), dish));

  api.post("/dishes", async (c) => {
    const input = dishInput(await readJson(c));
    const dish: Dish = { ...input, id: `custom-${randomUUID()}`, custom: true };
    return c.json(store(dish));
  });

  api.post("/dishes/import-url", async (c) => {
    const body = rec(await readJson(c), "Import");
    const url = str(body.url, "Link", { min: 8, max: 1000 });
    const recipe = await importRecipeFromUrl(url, deps.fetch, AbortSignal.timeout(15_000));
    return c.json(store({ ...recipe, id: `custom-${randomUUID()}`, custom: true }));
  });

  api.put("/dishes/:id", async (c) => {
    const existing = need(c.req.param("id"));
    const input = dishInput(await readJson(c));
    const dish: Dish = { ...input, id: existing.id };
    if (existing.custom || !isBuiltinDish(existing.id)) dish.custom = true;
    if (existing.archivedAt) dish.archivedAt = existing.archivedAt;
    return c.json(store(dish));
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
