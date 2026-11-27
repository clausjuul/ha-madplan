import { describe, expect, it } from "vitest";
import type { Dish, DishPreview, ShoppingList } from "@madplan/domain";
import { applyReview, markReviewed, reviewEarlierImports } from "../src/ai/recipe-review.ts";
import { loadConfig } from "../src/config.ts";
import { parseRecipeHtml, type ParsedRecipe } from "../src/ai/recipe-import.ts";
import { saveDish, tidyImportedDishes, findDish } from "../src/store-dishes.ts";
import { Repo } from "../src/repo.ts";
import { openDatabase } from "../src/db.ts";
import { fakeAi, setup } from "./helpers.ts";

// The ingredient lines as a WP Recipe Maker site delivered "Bearnaise lasagne".
const LINES = [
  "400 gr hakket oksekød",
  "1 løg ((hakket))",
  "500 gr kartofler ((skrællede og skåret i tynde skiver))",
  "75 gr revet ost, fx mozzarella",
  "2 spsk tørret, fransk ekstragon ((eller friskhakket estragon))",
  "2,5 dl kogevand fra pastaen",
  "salt og peber",
];

const page = (yieldValue: unknown = "4 personer"): string =>
  `<html><head><script type="application/ld+json">${JSON.stringify({
    "@type": "Recipe",
    name: "Bearnaise lasagne",
    recipeYield: yieldValue,
    recipeIngredient: LINES,
    recipeInstructions: [{ "@type": "HowToStep", text: "Brun kødet &amp; løget." }],
  })}</script></head></html>`;

const recipe = (ingredients: string[]): ParsedRecipe => ({
  name: "Test",
  ingredients,
  prepMinutes: 30,
  category: "Importeret",
  favorite: false,
  leftoverFriendly: false,
  freezerFriendly: false,
});

describe("recipe import cleanup", () => {
  it("collapses doubled parentheses, decodes entities and reads the servings", () => {
    const parsed = parseRecipeHtml(page(), "https://opskrift.example.dk/x");
    expect(parsed?.ingredients[1]).toBe("1 løg (hakket)");
    expect(parsed?.ingredients[2]).toBe("500 gr kartofler (skrællede og skåret i tynde skiver)");
    expect(parsed?.instructions).toEqual(["Brun kødet & løget."]);
    expect(parsed?.servings).toBe(4);
    expect(parseRecipeHtml(page(["4", "4 portioner"]), "https://x.dk/")?.servings).toBe(4);
    expect(parseRecipeHtml(page("en gruppe"), "https://x.dk/")?.servings).toBeUndefined();
  });
});

describe("recipe review guard", () => {
  it("accepts tidied lines but keeps the original when an amount or unit would change", () => {
    const base = recipe(["400 gr hakket oksekød", "2 løg", "1 dl fløde", "salt"]);
    const { recipe: next, review } = applyReview(base, {
      ingredients: ["400 g hakket oksekød", "2 g løg", "2 dl fløde", "1 tsk. salt"],
      servings: 4,
      changes: ["400 gr er rettet til 400 g"],
    });
    expect(next.ingredients).toEqual(["400 g hakket oksekød", "2 løg", "1 dl fløde", "salt"]);
    expect(next.servings).toBe(4);
    expect(review).toEqual({ checked: true, changes: ["400 gr er rettet til 400 g"] });
  });

  it("ignores an answer with a different number of lines", () => {
    const base = recipe(["1 løg", "2 gulerødder"]);
    const outcome = applyReview(base, { ingredients: ["1 løg"], servings: null, changes: ["x"] });
    expect(outcome.recipe).toBe(base);
    expect(outcome.review.checked).toBe(false);
  });

  it("reports nothing when nothing changed", () => {
    const base = recipe(["1 løg", "2 gulerødder"]);
    expect(applyReview(base, { ingredients: ["1 løg", "2 gulerødder"], servings: null, changes: ["Intet"] }).review).toEqual({
      checked: true,
      changes: [],
    });
  });
});

describe("import with the review", () => {
  const fetchPage = (): Promise<Response> => Promise.resolve(new Response(page(), { headers: { "content-type": "text/html" } }));

  it("previews the checked version with what was corrected, and saves nothing until asked", async () => {
    const ai = fakeAi();
    ai.next(
      JSON.stringify({
        ingredients: [
          "400 g hakket oksekød",
          "1 løg (hakket)",
          "500 g kartofler (skrællede og skåret i tynde skiver)",
          "75 g revet ost (fx mozzarella)",
          "2 spsk. tørret estragon (eller frisk)",
          "2,5 dl kogevand fra pastaen",
          "salt og peber",
        ],
        servings: 4,
        changes: ["Gram er rettet fra gr til g", "ekstragon er rettet til estragon"],
      }),
    );
    const { json, deps } = setup({ openai: ai, fetch: fetchPage });
    const before = (await json<{ dishes: Dish[] }>("GET", "bootstrap")).dishes.length;
    const { dish, how, review } = await json<DishPreview>("POST", "dishes/read", { url: "https://opskrift.example.dk/bearnaise" });
    expect(how).toBe("structured");
    expect(dish.ingredients[0]).toBe("400 g hakket oksekød");
    expect(dish.ingredients[4]).toBe("2 spsk. tørret estragon (eller frisk)");
    expect(review).toEqual({ checked: true, changes: ["Gram er rettet fra gr til g", "ekstragon er rettet til estragon"] });
    expect(ai.calls[0]?.input).toContain("400 gr hakket oksekød");
    expect((await json<{ dishes: Dish[] }>("GET", "bootstrap")).dishes).toHaveLength(before);

    // Saved from the form, it is not checked again by the startup pass for older imports.
    const saved = await json<Dish>("POST", "dishes", dish);
    expect(saved).toMatchObject({ name: dish.name, sourceUrl: "https://opskrift.example.dk/bearnaise", custom: true });
    expect(await reviewEarlierImports({ repo: deps.repo, openai: ai, config: deps.config })).toEqual([]);
    expect(ai.calls).toHaveLength(1);
  });

  it("still reads the recipe, cleaned but unchecked, when the AI fails or is not set up", async () => {
    const ai = fakeAi(); // no answer queued -> the call fails
    const { json } = setup({ openai: ai, fetch: fetchPage });
    const { dish, review } = await json<DishPreview>("POST", "dishes/read", { url: "https://opskrift.example.dk/bearnaise" });
    expect(review).toEqual({ checked: false, changes: [] });
    expect(dish.ingredients[1]).toBe("1 løg (hakket)");

    const plain = setup({ fetch: fetchPage });
    expect((await plain.json<DishPreview>("POST", "dishes/read", { url: "https://opskrift.example.dk/b" })).review?.checked).toBe(false);
  });

  it("puts the imported dish on the shopping list in grams, without notes or pasta water", async () => {
    const { json } = setup({ fetch: fetchPage });
    const { dish: preview } = await json<DishPreview>("POST", "dishes/read", { url: "https://opskrift.example.dk/bearnaise" });
    const dish = await json<Dish>("POST", "dishes", preview);
    await json("PUT", "meals/2026-11-11", { dishId: dish.id });
    const list = await json<ShoppingList>("GET", "shopping?from=2026-11-11&to=2026-11-11");
    const items = list.items;
    const labels = items.map((item) => `${item.label}: ${item.quantityLabel}`);
    expect(labels).toEqual(expect.arrayContaining(["hakket oksekød: 400 g", "løg: 1 stk.", "kartofler: 500 g"]));
    expect(items.some((item) => /kogevand/u.test(item.label))).toBe(false);
    expect(items.some((item) => /\(/u.test(item.label))).toBe(false);
  });
});

describe("tidying dishes imported before the cleanup", () => {
  it("fixes stored lines once and leaves other dishes alone", () => {
    const repo = new Repo(openDatabase(":memory:"));
    saveDish(repo.db, { ...recipe(LINES), id: "custom-a", custom: true, sourceUrl: "https://x.dk/a" });
    saveDish(repo.db, { ...recipe(["1 løg ((hakket))"]), id: "custom-b", custom: true });
    expect(tidyImportedDishes(repo.db)).toBe(1);
    expect(findDish(repo.db, "custom-a")?.ingredients[1]).toBe("1 løg (hakket)");
    expect(findDish(repo.db, "custom-b")?.ingredients[0]).toBe("1 løg ((hakket))");
    expect(tidyImportedDishes(repo.db)).toBe(0);
  });
});

describe("checking dishes imported before the recipe check", () => {
  const config = loadConfig({}, "./no-options.json");

  it("reviews each earlier import once and skips the ones already checked", async () => {
    const repo = new Repo(openDatabase(":memory:"));
    saveDish(repo.db, { ...recipe(["400 gr hakket oksekød", "1 alm løg"]), name: "Gammel", id: "custom-old", custom: true, sourceUrl: "https://x.dk/a" });
    saveDish(repo.db, { ...recipe(["1 løg"]), id: "custom-new", custom: true, sourceUrl: "https://x.dk/b" });
    markReviewed(repo.db, "custom-new");
    saveDish(repo.db, { ...recipe(["1 løg"]), id: "custom-own", custom: true });

    const ai = fakeAi();
    ai.next(JSON.stringify({ ingredients: ["400 g hakket oksekød", "1 løg"], servings: null, changes: ["alm løg er rettet til løg"] }));
    expect(await reviewEarlierImports({ repo, openai: ai, config })).toEqual(["Gammel"]);
    expect(ai.calls).toHaveLength(1);
    expect(findDish(repo.db, "custom-old")?.ingredients).toEqual(["400 g hakket oksekød", "1 løg"]);

    expect(await reviewEarlierImports({ repo, openai: ai, config })).toEqual([]);
    expect(ai.calls).toHaveLength(1);
  });

  it("retries on the next start when the check failed", async () => {
    const repo = new Repo(openDatabase(":memory:"));
    saveDish(repo.db, { ...recipe(["1 alm løg"]), id: "custom-old", custom: true, sourceUrl: "https://x.dk/a" });
    const ai = fakeAi(); // no answer -> fails
    expect(await reviewEarlierImports({ repo, openai: ai, config })).toEqual([]);
    ai.next(JSON.stringify({ ingredients: ["1 løg"], servings: null, changes: ["alm løg er rettet til løg"] }));
    expect(await reviewEarlierImports({ repo, openai: ai, config })).toHaveLength(1);
  });
});
