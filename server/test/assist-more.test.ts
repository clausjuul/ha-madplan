import { describe, expect, it } from "vitest";
import type { AssistApplyResult, AssistResponse, BootstrapResponse, ShoppingList } from "@madplan/domain";
import { fakeAi, setup } from "./helpers.ts";

const ASK = { messages: [{ role: "user", content: "Gør det" }], context: { view: "uge" } };
const answer = (actions: unknown[]): string => JSON.stringify({ reply: "Forslag.", actions });
const person = (id: string, name: string) => ({ id, name, active: true, exclusions: [], preferences: [], dislikes: [], favoriteDishIds: [] });
type Json = ReturnType<typeof setup>["json"];

async function run(actions: unknown[], prepare?: (json: Json) => Promise<void>) {
  const ai = fakeAi();
  const app = setup({ openai: ai });
  await prepare?.(app.json);
  ai.next(answer(actions));
  const response = await app.json<AssistResponse>("POST", "assist", ASK);
  const apply = (): Promise<AssistApplyResult> => app.json<AssistApplyResult>("POST", `assist/proposals/${response.proposal?.id}/apply`);
  const boot = (): Promise<BootstrapResponse> => app.json<BootstrapResponse>("GET", "bootstrap");
  return { ...app, ai, response, apply, boot };
}

describe("assist: dishes", () => {
  it("edits only the given fields and archives a dish, undoably", async () => {
    const t = await run([
      {
        type: "updateDish",
        dishId: "lasagne",
        changes: { name: null, ingredients: null, instructions: null, prepMinutes: 50, category: null, servings: null, favorite: true },
      },
      { type: "archiveDish", dishId: "tacos", archived: true },
    ]);
    expect(t.response.proposal?.actions.map((action) => action.label)).toEqual([
      "«Lasagne»: ret tid, favorit",
      "Arkivér «Tacos» (kan gendannes)",
    ]);
    const before = (await t.boot()).dishes.find((dish) => dish.id === "lasagne");
    const result = await t.apply();
    expect(result.applied).toBe(2);
    const after = await t.boot();
    expect(after.dishes.find((dish) => dish.id === "lasagne")).toMatchObject({
      prepMinutes: 50,
      favorite: true,
      name: before?.name,
      ingredients: before?.ingredients,
    });
    expect(after.dishes.find((dish) => dish.id === "tacos")?.archivedAt).toBeTruthy();
    await t.json("POST", `assist/undo/${result.undoId}`);
    const undone = await t.boot();
    expect(undone.dishes.find((dish) => dish.id === "lasagne")?.prepMinutes).toBe(before?.prepMinutes);
    expect(undone.dishes.find((dish) => dish.id === "tacos")?.archivedAt).toBeUndefined();
  });

  it("imports a recipe from a link as a new dish", async () => {
    const ai = fakeAi();
    const recipe = {
      "@type": "Recipe",
      name: "Boller i karry",
      image: "https://cdn.example.dk/b.jpg",
      recipeIngredient: ["500 g hakket svinekød", "karry"],
      recipeInstructions: ["Lav boller."],
    };
    const page = `<script type="application/ld+json">${JSON.stringify(recipe)}</script>`;
    const fetch = (async () => new Response(page, { headers: { "content-type": "text/html" } })) as typeof globalThis.fetch;
    const { json } = setup({ openai: ai, fetch });
    ai.next(answer([{ type: "importDishFromUrl", url: "https://example.dk/boller" }]));
    const response = await json<AssistResponse>("POST", "assist", ASK);
    const action = response.proposal?.actions[0];
    expect(action?.type).toBe("createDish");
    expect(action?.type === "createDish" ? action.dish : undefined).toMatchObject({ name: "Boller i karry", imageUrl: "https://cdn.example.dk/b.jpg" });
  });
});

describe("assist: several days", () => {
  const plan = async (json: Json): Promise<void> => {
    await json("PUT", "meals/2026-11-10", { dishId: "lasagne" });
    await json("PUT", "meals/2026-11-11", { dishId: "tacos" });
    await json("PUT", "meals/2026-11-12", { dishId: "lasagne" });
    await json("PATCH", "meals/2026-11-12", { locked: true });
  };

  it("clears unlocked days and keeps locked ones", async () => {
    const t = await run([{ type: "clearMeals", from: "2026-11-10", to: "2026-11-16" }], plan);
    await t.apply();
    const meals = (await t.boot()).meals;
    expect(meals["2026-11-10"]).toBeUndefined();
    expect(meals["2026-11-11"]).toBeUndefined();
    expect(meals["2026-11-12"]?.dishId).toBe("lasagne");
  });

  it("copies and moves meals", async () => {
    const t = await run(
      [
        { type: "copyMeals", sourceFrom: "2026-11-10", targetFrom: "2026-11-17", dayCount: 2 },
        { type: "moveMeals", from: "2026-11-10", to: "2026-11-11", days: 3 },
      ],
      plan,
    );
    expect((await t.apply()).applied).toBe(2);
    const meals = (await t.boot()).meals;
    expect(meals["2026-11-17"]?.dishId).toBe("lasagne");
    expect(meals["2026-11-18"]?.dishId).toBe("tacos");
    expect(meals["2026-11-10"]).toBeUndefined();
    expect(meals["2026-11-13"]?.dishId).toBe("lasagne");
    expect(meals["2026-11-14"]?.dishId).toBe("tacos");
  });

  it("refuses to move onto a locked day", async () => {
    const t = await run([{ type: "moveMeals", from: "2026-11-10", to: "2026-11-11", days: 1 }], plan);
    expect(t.response.proposal).toBeUndefined();
  });
});

describe("assist: shopping and basisvarer", () => {
  it("adds a dish's missing ingredients, ticks items off and resets", async () => {
    const t = await run([{ type: "addDishToShopping", dishId: "tacos", onlyMissing: true }], async (json) => {
      await json("PUT", "pantry", ["salt"]);
    });
    const action = t.response.proposal?.actions[0];
    const items = action?.type === "addDishToShopping" ? action.items : [];
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => /^salt$/iu.test(item))).toBe(false);
    await t.apply();
    const first = (await t.json<ShoppingList>("GET", "shopping")).items.find((item) => item.extra);
    if (!first) throw new Error("no extra item");

    t.ai.next(answer([{ type: "checkShoppingItems", itemIds: [first.id], checked: true }]));
    const tick = await t.json<AssistResponse>("POST", "assist", ASK);
    expect(tick.proposal?.actions[0]?.label).toContain(first.label);
    await t.json("POST", `assist/proposals/${tick.proposal?.id}/apply`);
    expect((await t.json<ShoppingList>("GET", "shopping")).items.find((item) => item.id === first.id)?.checked).toBe(true);

    t.ai.next(answer([{ type: "resetShopping" }]));
    const reset = await t.json<AssistResponse>("POST", "assist", ASK);
    await t.json("POST", `assist/proposals/${reset.proposal?.id}/apply`);
    expect((await t.json<ShoppingList>("GET", "shopping")).items.some((item) => item.extra)).toBe(false);
  });

  it("adds and removes basisvarer", async () => {
    const t = await run([{ type: "addPantryItem", name: "Olivenolie" }, { type: "removePantryItem", name: "salt" }], async (json) => {
      await json("PUT", "pantry", ["salt", "peber"]);
    });
    await t.apply();
    expect((await t.boot()).pantry).toEqual(["peber", "Olivenolie"]);
  });
});

describe("assist: settings and family", () => {
  it("changes stores, servings and the offer watch", async () => {
    const t = await run([
      { type: "setPreferredStores", stores: ["rema1000"] },
      { type: "setServings", servings: 4 },
      { type: "watchOffer", name: "kaffe", remove: false },
    ]);
    expect((await t.apply()).applied).toBe(3);
    expect((await t.boot()).settings).toMatchObject({
      preferredStores: ["rema1000"],
      preferredServings: 4,
      offerWatchlist: [{ name: "kaffe" }],
    });
  });

  it("adds, pauses, sizes and removes people", async () => {
    const t = await run(
      [
        { type: "addProfile", name: "Mormor", portions: null },
        { type: "setProfileActive", profileId: "a", active: false },
        { type: "setProfilePortions", profileId: "b", portions: 0.5 },
        { type: "removeProfile", profileId: "c" },
      ],
      async (json) => {
        await json("PUT", "profiles", [person("a", "Anna"), person("b", "Bo"), person("c", "Carl")]);
      },
    );
    expect((await t.apply()).applied).toBe(4);
    const profiles = (await t.boot()).profiles;
    expect(profiles.map((profile) => profile.name)).toEqual(["Anna", "Bo", "Mormor"]);
    expect(profiles[0]?.active).toBe(false);
    expect(profiles[1]?.portions).toBe(0.5);
  });

  it("refuses to remove the last person", async () => {
    const t = await run([{ type: "removeProfile", profileId: "a" }], async (json) => {
      await json("PUT", "profiles", [person("a", "Anna")]);
    });
    expect(t.response.proposal).toBeUndefined();
  });
});

describe("assist: undo", () => {
  it("is not blocked by changes elsewhere, but is by a change to the same day", async () => {
    const t = await run([{ type: "setMeal", date: "2026-11-12", dishId: "tacos" }]);
    const first = await t.apply();
    // Someone else changes another day: the undo still goes through.
    await t.json("PUT", "meals/2026-11-14", { dishId: "lasagne" });
    await t.json("POST", `assist/undo/${first.undoId}`);
    expect((await t.boot()).meals["2026-11-14"]?.dishId).toBe("lasagne");

    t.ai.next(answer([{ type: "setMeal", date: "2026-11-12", dishId: "tacos" }]));
    const again = await t.json<AssistResponse>("POST", "assist", ASK);
    const second = await t.json<AssistApplyResult>("POST", `assist/proposals/${again.proposal?.id}/apply`);
    // Someone changes the same day afterwards: undo would overwrite it, so it is refused.
    await t.json("PUT", "meals/2026-11-12", { dishId: "lasagne" });
    expect((await t.call("POST", `assist/undo/${second.undoId}`)).status).toBe(409);
    expect((await t.boot()).meals["2026-11-12"]?.dishId).toBe("lasagne");
  });
});
