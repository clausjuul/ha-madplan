import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import type { Dish, InspirationRecipe } from "@madplan/domain";
import { discoverRecipes } from "../ai/discovery.ts";
import { importRecipeFromUrl } from "../ai/recipe-import.ts";
import type { Deps } from "../deps.ts";
import { badRequest, unavailable } from "../errors.ts";
import { readJson } from "../http.ts";
import { rememberRecipes, seenRecipes } from "../store-household.ts";
import { saveDish } from "../store-dishes.ts";
import { snapshot } from "../state.ts";
import { discoverInput, inspirations } from "../validate.ts";
import { rec } from "../validate-basic.ts";

export function discoveryRoutes(api: Hono, deps: Deps): void {
  const { repo } = deps;

  api.post("/discover", async (c) => {
    const input = discoverInput(await readJson(c));
    if (!deps.openai.configured) {
      throw unavailable("Tilføj en OpenAI API-nøgle i appens konfiguration for at søge efter opskrifter.");
    }
    const state = snapshot(deps);
    const seen = seenRecipes(repo.db);
    const found = await discoverRecipes(
      deps.openai,
      deps.config.discoveryModel,
      input,
      seen,
      { globalExclusions: state.settings.globalExclusions, profiles: state.profiles },
      AbortSignal.timeout(120_000),
    );
    repo.mutate(["inspirations"], () =>
      rememberRecipes(
        repo.db,
        found.map((r) => ({ identity: r.identity, sourceUrl: r.sourceUrl, name: r.name })),
        deps.now().toISOString(),
      ),
    );
    const recipes: InspirationRecipe[] = found.map(({ identity: _identity, ...recipe }) => recipe);
    return c.json({ recipes });
  });

  api.post("/discover/import", async (c) => {
    const body = rec(await readJson(c), "Import");
    const [recipe] = inspirations([body.recipe]);
    if (!recipe) throw badRequest("Opskriften mangler.");
    const parsed = await importRecipeFromUrl(recipe.sourceUrl, deps.fetch, AbortSignal.timeout(15_000));
    const dish: Dish = { ...parsed, id: `custom-${randomUUID()}`, custom: true, category: recipe.cuisine };
    if (recipe.imageKey) dish.imageKey = recipe.imageKey;
    else if (recipe.imageUrl && !dish.imageUrl) dish.imageUrl = recipe.imageUrl;
    return c.json(repo.mutate(["dishes"], () => (saveDish(repo.db, dish), dish)));
  });
}
