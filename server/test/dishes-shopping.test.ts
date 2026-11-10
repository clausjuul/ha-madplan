import { describe, expect, it } from "vitest";
import type { BootstrapResponse, Dish, ShoppingList } from "@madplan/domain";
import { setup } from "./helpers.ts";

const newDish = {
  name: "Min gryde",
  ingredients: ["500 g kylling", "1 løg"],
  prepMinutes: 40,
  category: "Gryderetter",
  favorite: true,
  leftoverFriendly: false,
  freezerFriendly: false,
};

const RECIPE_HTML = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Recipe",
      name: "Bedste boller",
      totalTime: "PT1H15M",
      recipeIngredient: ["500 g mel", "3 dl mælk"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Ælt dejen." }, { "@type": "HowToStep", text: "Bag." }],
    },
  ],
})}</script></head><body></body></html>`;

describe("dishes", () => {
  it("creates custom dishes, overrides built-ins and archives/restores", async () => {
    const { json, call } = setup();
    const created = await json<Dish>("POST", "dishes", newDish);
    expect(created.id).toMatch(/^custom-/u);
    expect(created.custom).toBe(true);

    const overridden = await json<Dish>("PUT", "dishes/lasagne", { ...newDish, name: "Lasagne deluxe" });
    expect(overridden.id).toBe("lasagne");
    const boot = await json<BootstrapResponse>("GET", "bootstrap");
    expect(boot.dishes.find((d) => d.id === "lasagne")?.name).toBe("Lasagne deluxe");
    expect(boot.dishes.filter((d) => d.id === "lasagne")).toHaveLength(1);

    const archived = await json<Dish>("POST", "dishes/tacos/archive");
    expect(archived.archivedAt).toBeTruthy();
    expect(archived.name).toBe("Tacos");
    expect((await json<BootstrapResponse>("GET", "bootstrap")).dishes.find((d) => d.id === "tacos")?.archivedAt).toBeTruthy();
    const restored = await json<Dish>("POST", "dishes/tacos/restore");
    expect(restored.archivedAt).toBeUndefined();

    expect((await call("POST", "dishes", { name: "" })).status).toBe(400);
    expect((await call("PUT", "dishes/findes-ikke", newDish)).status).toBe(404);
    expect((await call("POST", "dishes/findes-ikke/archive")).status).toBe(404);
  });

  it("imports a dish from a URL's JSON-LD and refuses unusable pages", async () => {
    const fetched: string[] = [];
    const { json, call } = setup({
      fetch: (input) => {
        const url = String(input);
        fetched.push(url);
        const html = url.includes("tom") ? "<html></html>" : RECIPE_HTML;
        return Promise.resolve(new Response(html, { headers: { "content-type": "text/html" } }));
      },
    });
    const dish = await json<Dish>("POST", "dishes/import-url", { url: "https://opskrifter.example.dk/boller" });
    expect(dish).toMatchObject({ name: "Bedste boller", prepMinutes: 75, custom: true });
    expect(dish.instructions).toEqual(["Ælt dejen.", "Bag."]);
    expect(dish.sourceUrl).toBe("https://opskrifter.example.dk/boller");

    const empty = await call("POST", "dishes/import-url", { url: "https://opskrifter.example.dk/tom" });
    expect(empty.status).toBe(422);
    expect((await call("POST", "dishes/import-url", { url: "http://opskrifter.example.dk/x" })).status).toBe(422);
    expect((await call("POST", "dishes/import-url", { url: "https://192.168.1.1/x" })).status).toBe(422);
    expect(fetched).toHaveLength(2);
  });
});

describe("shopping", () => {
  it("builds the current list from planned meals, toggles, adds extras and resets", async () => {
    const { json, call } = setup();
    await json("PUT", "meals/2026-11-09", { dishId: "lasagne" });
    await json("PUT", "meals/2026-11-11", { dishId: "tacos" });

    let list = await json<ShoppingList>("GET", "shopping");
    expect(list.from).toBe("2026-11-09");
    expect(list.to).toBe("2026-11-11");
    expect(list.items.length).toBeGreaterThan(5);
    expect(list.checkedCount).toBe(0);

    const first = list.items[0];
    expect(first).toBeDefined();
    list = await json<ShoppingList>("POST", "shopping/toggle", { itemId: first?.id });
    expect(list.checkedCount).toBe(1);
    list = await json<ShoppingList>("POST", "shopping/toggle", { itemId: first?.id });
    expect(list.checkedCount).toBe(0);

    list = await json<ShoppingList>("POST", "shopping/extras", { label: "Vaskemiddel" });
    const extra = list.items.find((item) => item.extra);
    expect(extra?.label).toBe("Vaskemiddel");
    list = await json<ShoppingList>("DELETE", `shopping/extras/${encodeURIComponent(extra?.id ?? "")}`);
    expect(list.items.some((item) => item.extra)).toBe(false);
    expect((await call("DELETE", "shopping/extras/extra:findes-ikke")).status).toBe(404);

    await json("POST", "shopping/toggle", { itemId: first?.id });
    await json("POST", "shopping/extras", { label: "Brød" });
    list = await json<ShoppingList>("POST", "shopping/reset");
    expect(list.checkedCount).toBe(0);
    expect(list.items.some((item) => item.extra)).toBe(false);
  });

  it("uses the exact extra item ids the client sends back, also with spaces, case and æøå", async () => {
    const { json, call } = setup();
    let list = await json<ShoppingList>("POST", "shopping/extras", { label: "2 Liter Mælk" });
    const extra = list.items.find((item) => item.extra);
    expect(extra?.id).toBe("extra:2 liter mælk");
    // Same item in other case / spacing is a duplicate.
    list = await json<ShoppingList>("POST", "shopping/extras", { label: "2  liter mælk" });
    expect(list.items.filter((item) => item.extra)).toHaveLength(1);
    await json("POST", "shopping/toggle", { itemId: extra?.id });
    list = await json<ShoppingList>("DELETE", `shopping/extras/${encodeURIComponent(extra?.id ?? "")}`);
    expect(list.items.some((item) => item.extra)).toBe(false);
    expect(list.checkedCount).toBe(0);
    expect((await call("DELETE", "shopping/extras/extra%3A2%20liter%20m%C3%A6lk")).status).toBe(404);
  });

  it("respects explicit ranges and validates input", async () => {
    const { json, call } = setup();
    await json("PUT", "meals/2026-11-20", { dishId: "lasagne" });
    const empty = await json<ShoppingList>("GET", "shopping?from=2026-11-09&to=2026-11-12");
    expect(empty.items).toHaveLength(0);
    const ranged = await json<ShoppingList>("GET", "shopping?from=2026-11-19&to=2026-11-21");
    expect(ranged.items.length).toBeGreaterThan(0);
    expect((await call("GET", "shopping?from=i-morgen")).status).toBe(400);
    expect((await call("POST", "shopping/toggle", {})).status).toBe(400);
    expect((await call("POST", "shopping/extras", { label: "  " })).status).toBe(400);
  });

  it("drops fridge and pantry items from the list", async () => {
    const { json } = setup();
    await json("PUT", "meals/2026-11-09", { dishId: "lasagne" });
    const before = await json<ShoppingList>("GET", "shopping");
    await json("PUT", "pantry", ["pasta", "løg"]);
    await json("PUT", "fridge", [{ name: "hakket oksekød", quantity: "500 g" }]);
    const after = await json<ShoppingList>("GET", "shopping");
    expect(after.items.length).toBeLessThan(before.items.length);
    expect(after.excludedCount).toBeGreaterThan(0);
  });
});
