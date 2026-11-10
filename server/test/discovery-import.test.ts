import { describe, expect, it } from "vitest";
import type { ApiError, BootstrapResponse, Dish, ImportResult, InspirationRecipe } from "@madplan/domain";
import { AiError } from "../src/ai/openai.ts";
import { fakeAi, setup } from "./helpers.ts";

const candidate = (name: string, host: string, extra: Record<string, unknown> = {}) => ({
  name,
  originalName: name,
  cuisine: "Thailand",
  description: "God mad",
  prepMinutes: 25,
  tags: [name],
  sourceUrl: `https://${host}/${name.toLowerCase().replace(/\s+/gu, "-")}`,
  ...extra,
});

describe("discovery", () => {
  it("returns 503 without OpenAI", async () => {
    const { call } = setup();
    expect((await call("POST", "discover", { request: "", cuisine: "Alle" })).status).toBe(503);
  });

  it("returns approved, varied recipes and avoids repeating them next time", async () => {
    const ai = fakeAi();
    ai.next(
      JSON.stringify({
        recipes: [
          candidate("Pad Thai", "hot-thai-kitchen.com"),
          candidate("Green Curry", "hot-thai-kitchen.com"),
          candidate("Tom Kha", "hot-thai-kitchen.com"),
          candidate("Falsk", "ukendt-side.com"),
          candidate("Larb Gai", "recipetineats.com", { cuisine: "Kina" }),
          candidate("Satay", "http://hot-thai-kitchen.com".replace("http://", "")),
        ],
      }),
    );
    const { json } = setup({ openai: ai });
    const first = await json<{ recipes: InspirationRecipe[] }>("POST", "discover", { request: "nudler", cuisine: "Thailand" });
    const names = first.recipes.map((r) => r.name);
    expect(names).toEqual(["Pad Thai", "Green Curry"]);
    expect(first.recipes[0]).toMatchObject({ cuisine: "Thailand", sourceName: "Hot Thai Kitchen" });
    expect(first.recipes[0]).not.toHaveProperty("identity");
    expect(ai.calls[0]?.webSearch).toBe(true);
    expect(ai.calls[0]?.input).toContain("nudler");
    expect(ai.calls[0]?.instructions).not.toContain("nudler");
    expect(ai.calls[0]?.instructions).toContain("UTROVÆRDIGE DATA");

    ai.next(JSON.stringify({ recipes: [candidate("Pad Thai", "hot-thai-kitchen.com"), candidate("Massaman", "hot-thai-kitchen.com")] }));
    const second = await json<{ recipes: InspirationRecipe[] }>("POST", "discover", { request: "", cuisine: "Alle" });
    expect(second.recipes.map((r) => r.name)).toEqual(["Massaman"]);
    expect(ai.calls[1]?.input).toContain("Pad Thai");
  });

  it("reports failures: no web search, bad JSON, nothing usable, model error", async () => {
    const ai = fakeAi();
    const { call } = setup({ openai: ai });
    ai.next({ text: JSON.stringify({ recipes: [] }), usedWebSearch: false });
    expect((await call("POST", "discover", { request: "", cuisine: "Alle" })).status).toBe(502);
    ai.next("ingen json her");
    expect((await call("POST", "discover", { request: "", cuisine: "Alle" })).status).toBe(502);
    ai.next(JSON.stringify({ recipes: [candidate("Falsk", "ukendt.com")] }));
    const none = await call("POST", "discover", { request: "", cuisine: "Alle" });
    expect(none.status).toBe(422);
    expect(((await none.json()) as ApiError).message).toMatch(/Ingen nye/u);
    ai.next(new AiError("Nøglen er ugyldig."));
    const failed = await call("POST", "discover", { request: "", cuisine: "Alle" });
    expect(failed.status).toBe(502);
    expect(((await failed.json()) as ApiError).message).toBe("Nøglen er ugyldig.");
    expect((await call("POST", "discover", { cuisine: "Atlantis" })).status).toBe(400);
  });

  it("imports a discovered recipe as a dish via its JSON-LD", async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe",
      name: "Pad Thai",
      recipeIngredient: ["200 g nudler", "2 æg"],
      recipeInstructions: "Steg.\nServér.",
    })}</script>`;
    const { json, call } = setup({
      fetch: () => Promise.resolve(new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })),
    });
    const recipe: InspirationRecipe = {
      id: "d1",
      name: "Pad Thai",
      cuisine: "Thailand",
      prepMinutes: 25,
      description: "",
      tags: [],
      sourceName: "Hot Thai Kitchen",
      sourceUrl: "https://hot-thai-kitchen.com/pad-thai",
      imageKey: "pad-thai",
    };
    const dish = await json<Dish>("POST", "discover/import", { recipe });
    expect(dish).toMatchObject({ name: "Pad Thai", category: "Thailand", custom: true, imageKey: "pad-thai" });
    expect(dish.instructions).toEqual(["Steg.", "Servér."]);
    expect((await json<BootstrapResponse>("GET", "bootstrap")).dishes.some((d) => d.id === dish.id)).toBe(true);
    expect((await call("POST", "discover/import", {})).status).toBe(400);
  });
});

const v1 = {
  version: 1,
  meals: {
    "2026-11-02": { dishId: "lasagne", status: "eaten", note: "Mums", locked: true, source: "manual" },
    "2026-11-10": { dishId: "own-1", status: "planned", note: "", locked: false, source: "local" },
  },
  fridge: ["tomater"],
  fridgeDetails: { tomater: { quantity: "3 stk.", useFirst: true } },
  globalExclusions: "rejer, nødder",
  household: [{ id: "claus", name: "Claus" }],
  customDishes: [
    {
      id: "own-1",
      name: "Familiens gryde",
      ingredients: ["500 g kylling", "1 dåse kokosmælk"],
      servings: 4,
      prepMinutes: 40,
      category: "Gryder",
      favorite: true,
      leftoverFriendly: false,
      freezerFriendly: false,
      custom: true,
    },
  ],
  savedInspirationIds: [],
  savedInspirationRecipes: [],
  hiddenDishIds: ["tacos"],
  includedDishesByWeek: {},
  preferredStores: ["netto"],
  pantryStaples: ["salt"],
  shoppingListsByWeek: { "2026-11-09": { checkedItems: ["ingredient:kylling:g"], extraItems: ["Brød"] } },
  planningSettingsByWeek: {},
  history: [],
};

describe("import/export", () => {
  it("imports a v1 state into an empty database and exposes it", async () => {
    const { json } = setup();
    const result = await json<ImportResult>("POST", "import/v1", v1);
    expect(result.counts).toMatchObject({ meals: 2, profiles: 1 });
    expect(result.counts.dishes).toBeGreaterThanOrEqual(2);
    const boot = await json<BootstrapResponse>("GET", "bootstrap");
    expect(boot.isEmpty).toBe(false);
    expect(boot.meals["2026-11-10"]?.dishId).toBe("own-1");
    expect(boot.meals["2026-11-02"]).toMatchObject({ locked: true, note: "Mums" });
    expect(boot.dishes.find((d) => d.id === "own-1")?.name).toBe("Familiens gryde");
    expect(boot.dishes.find((d) => d.id === "tacos")?.archivedAt).toBeTruthy();
    expect(boot.fridge).toEqual([{ name: "tomater", quantity: "3 stk.", useFirst: true }]);
    expect(boot.pantry).toEqual(["salt"]);
    expect(boot.settings.globalExclusions).toEqual(["rejer", "nødder"]);
    expect(boot.revision).toBe(1);
    const shopping = await json<{ items: { label: string; extra: boolean }[] }>("GET", "shopping");
    expect(shopping.items.some((item) => item.extra && item.label === "Brød")).toBe(true);
  });

  it("refuses import into a non-empty database (409) and malformed input (422)", async () => {
    const { json, call, app } = setup();
    const bad = await call("POST", "import/v1", { hej: "verden" });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as ApiError).message).toMatch(/format/u);
    const broken = await app.request("http://localhost/api/import/v1", { method: "POST", body: "ikke json {" });
    expect(broken.status).toBe(400);
    await json("POST", "import/v1", v1);
    const again = await call("POST", "import/v1", v1);
    expect(again.status).toBe(409);
    expect(((await again.json()) as ApiError).message).toMatch(/tom/u);
  });

  it("rolls back the whole import when something fails midway", async () => {
    const { call, repo } = setup();
    repo.db.exec("CREATE TRIGGER fail_pantry BEFORE INSERT ON pantry BEGIN SELECT RAISE(ABORT, 'boom'); END");
    const response = await call("POST", "import/v1", v1);
    expect(response.status).toBe(500);
    expect(((await response.json()) as ApiError).message).toMatch(/uventet/u);
    expect(repo.isEmpty()).toBe(true);
    expect(repo.revision()).toBe(0);
  });

  it("exports the household as a download with a dated filename", async () => {
    const { json, call } = setup();
    await json("PUT", "meals/2026-11-10", { dishId: "lasagne" });
    const response = await call("GET", "export");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="madplan-export-2026-11-09.json"');
    const file = (await response.json()) as { format: string; version: number; exportedAt: string; data: Record<string, unknown> };
    expect(file).toMatchObject({ format: "madplan-export", version: 2 });
    expect(Object.keys(file.data).sort()).toEqual(["dishes", "fridge", "meals", "pantry", "profiles", "savedInspirations", "settings"]);
    expect(file.data.meals).toHaveProperty("2026-11-10");
  });
});
