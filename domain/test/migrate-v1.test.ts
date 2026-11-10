import { describe, expect, it } from "vitest";
import { legacyWeekListId, migrateV1 } from "../src/index.ts";
import type { MadplanData, MealPlanStateV1 } from "../src/index.ts";

const NOW = "2026-11-09T08:00:00.000Z";

/** A realistic state as the old add-on / dashboard stored it. */
const fixture = (): MealPlanStateV1 => ({
  version: 1,
  meals: {
    "2026-10-19": { dishId: "lasagne", status: "eaten", note: "Mums", locked: true, source: "manual" },
    "2026-10-20": { dishId: "tacos", status: "planned", note: "", locked: false, source: "local", reason: "Ikke spist i 9 dage." },
    "2026-10-21": { dishId: "carbonara", status: "skipped", note: "Vi var ude", locked: false },
    "2026-10-22": {
      dishId: "own-1",
      status: "planned",
      note: "",
      locked: false,
      source: "ai",
      reason: "Bruger kylling fra køleskabet.",
      offer: { store: "Netto", item: "kylling", price: "2 for 80", validUntil: "2026-10-25", sourceUrl: "https://prej.dk/x" },
    },
  },
  fridge: ["tomater", "Kylling", "kylling"],
  fridgeDetails: {
    tomater: { quantity: "3 stk.", expiresOn: "2026-10-29", useFirst: true },
    Kylling: { quantity: "ca. 400 g" },
    smoer: { quantity: "1 pk." },
  },
  globalExclusions: "rejer, Nødder;\nsvampe",
  household: [
    { id: "claus", name: "Claus" },
    { id: "alice", name: "Alice", active: false, portions: 0.5, preferences: ["pasta"], dislikes: ["svampe"], exclusions: ["nødder"], favoriteDishIds: ["lasagne", "own-1"] },
  ],
  customDishes: [
    {
      id: "own-1",
      name: "Familiens kyllingegryde",
      ingredients: ["500 g kylling", "1 dåse kokosmælk"],
      servings: 4,
      prepMinutes: 40,
      category: "Gryde",
      favorite: true,
      leftoverFriendly: true,
      freezerFriendly: false,
      imageUrl: "https://example.com/gryde.jpg",
      sourceUrl: "https://example.com/gryde",
      instructions: ["Brun kyllingen", "Tilsæt kokosmælk"],
      custom: true,
      generated: true,
    },
    {
      id: "own-2",
      name: "Gammel ret",
      ingredients: ["1 løg"],
      prepMinutes: 15,
      category: "Andet",
      favorite: false,
      leftoverFriendly: false,
      freezerFriendly: false,
      imageUrl: "/meal-plan/dishes/gammel.jpg",
    },
  ],
  savedInspirationIds: ["inspiration-ramen", "inspiration-custom", "inspiration-borte"],
  savedInspirationRecipes: [
    {
      id: "inspiration-custom",
      name: "Egen inspiration",
      cuisine: "Thailand",
      prepMinutes: 25,
      description: "Fundet af AI",
      tags: ["nem"],
      sourceName: "Arla",
      sourceUrl: "https://www.arla.dk/opskrifter/x/",
      imageUrl: "/meal-plan/inspiration/panang-karry.jpg",
    },
  ],
  hiddenDishIds: ["own-2", "pasta-bolognese", "forsvundet"],
  includedDishesByWeek: { "2026-10-19": ["lasagne"] },
  preferredStores: ["netto", "rema1000"],
  preferredServings: 3,
  pantryStaples: ["salt", "peber", "Salt", "olie"],
  shoppingListsByWeek: {
    "2026-10-19": {
      checkedItems: ["ingredient:pasta:g", "extra:mælk"],
      extraItems: ["Mælk", "toiletpapir"],
    },
    "2026-10-26": { checkedItems: [], extraItems: [] },
  },
  planningSettingsByWeek: {
    "2026-10-19": { dayCount: 5, newDishCount: 1, skippedDates: [], request: "Nem uge" },
  },
  undoMealPlan: { meals: {}, history: [] },
  history: [
    { date: "2026-10-19", dishId: "lasagne", status: "eaten" },
    { date: "2026-10-21", dishId: "carbonara", status: "skipped" },
    { date: "2026-10-15", dishId: "frikadeller", status: "eaten" },
    { date: "2026-10-16", dishId: "tacos", status: "skipped" },
  ],
});

function migrate(input: unknown = fixture()): { data: MadplanData; warnings: string[] } {
  const result = migrateV1(input, { now: NOW });
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("migrateV1: meals and history", () => {
  const { data, warnings } = migrate();

  it("keeps meals with notes, locks, sources, reasons and offers", () => {
    expect(data.meals["2026-10-19"]).toEqual({ dishId: "lasagne", locked: true, note: "Mums", source: "manual" });
    expect(data.meals["2026-10-20"]).toEqual({ dishId: "tacos", locked: false, note: "", source: "local", reason: "Ikke spist i 9 dage." });
    expect(data.meals["2026-10-22"]?.offer).toMatchObject({ store: "Netto", price: "2 for 80" });
    expect(data.meals["2026-10-22"]?.source).toBe("ai");
  });

  it("turns skipped status and skipped history into skipped meals", () => {
    expect(data.meals["2026-10-21"]).toMatchObject({ dishId: "carbonara", skipped: true, note: "Vi var ude", source: "manual" });
    expect(data.meals["2026-10-16"]).toEqual({ dishId: "tacos", locked: false, note: "", source: "manual", skipped: true });
  });

  it("creates meals for eaten history entries that have none", () => {
    expect(data.meals["2026-10-15"]).toEqual({ dishId: "frikadeller", locked: false, note: "", source: "manual" });
  });

  it("does not mark eaten or planned meals as skipped", () => {
    expect(data.meals["2026-10-19"]?.skipped).toBeUndefined();
    expect(data.meals["2026-10-20"]?.skipped).toBeUndefined();
  });

  it("warns about dropped per-week planning data and undo state", () => {
    expect(warnings.join("\n")).toMatch(/planlægningsindstillinger/u);
    expect(warnings.join("\n")).toMatch(/Forhåndsvalgte retter/u);
    expect(warnings.join("\n")).toMatch(/Fortryd/u);
  });
});

describe("migrateV1: entities", () => {
  const { data, warnings } = migrate();

  it("migrates dishes: custom ones, bundled images, archived via hiddenDishIds", () => {
    const own = data.dishes.find((d) => d.id === "own-1");
    expect(own).toMatchObject({
      name: "Familiens kyllingegryde",
      servings: 4,
      favorite: true,
      leftoverFriendly: true,
      custom: true,
      generated: true,
      imageUrl: "https://example.com/gryde.jpg",
      sourceUrl: "https://example.com/gryde",
      instructions: ["Brun kyllingen", "Tilsæt kokosmælk"],
    });
    expect(own?.archivedAt).toBeUndefined();
    expect(data.dishes.find((d) => d.id === "own-2")).toMatchObject({ imageKey: "gammel", archivedAt: NOW });
    expect(data.dishes.find((d) => d.id === "own-2")?.imageUrl).toBeUndefined();
  });

  it("archives a hidden built-in dish by copying it from the catalog", () => {
    const hidden = data.dishes.find((d) => d.id === "pasta-bolognese");
    expect(hidden).toMatchObject({ name: "Pasta bolognese", archivedAt: NOW, imageKey: "pasta-bolognese" });
    expect(warnings.some((w) => w.includes("forsvundet"))).toBe(true);
  });

  it("migrates profiles with defaults", () => {
    expect(data.profiles[0]).toEqual({
      id: "claus",
      name: "Claus",
      active: true,
      exclusions: [],
      preferences: [],
      dislikes: [],
      favoriteDishIds: [],
    });
    expect(data.profiles[1]).toEqual({
      id: "alice",
      name: "Alice",
      active: false,
      portions: 0.5,
      preferences: ["pasta"],
      dislikes: ["svampe"],
      exclusions: ["nødder"],
      favoriteDishIds: ["lasagne", "own-1"],
    });
  });

  it("merges fridge items with their details and drops orphaned details", () => {
    expect(data.fridge).toEqual([
      { name: "tomater", quantity: "3 stk.", expiresOn: "2026-10-29", useFirst: true },
      { name: "Kylling", quantity: "ca. 400 g" },
    ]);
    expect(warnings.some((w) => w.includes('"smoer"'))).toBe(true);
  });

  it("migrates pantry and settings", () => {
    expect(data.pantry).toEqual(["salt", "peber", "olie"]);
    expect(data.settings).toEqual({
      globalExclusions: ["rejer", "Nødder", "svampe"],
      preferredStores: ["netto", "rema1000"],
      preferredServings: 3,
    });
  });

  it("maps week keys to list ids and skips empty lists", () => {
    expect(Object.keys(data.shoppingLists)).toEqual([legacyWeekListId("2026-10-19")]);
    expect(data.shoppingLists["week:2026-10-19"]).toEqual({
      checked: ["ingredient:pasta:g", "extra:mælk"],
      extras: [{ label: "Mælk" }, { label: "toiletpapir" }],
    });
  });

  it("migrates saved inspirations from objects and the catalog, and warns about unknown ids", () => {
    expect(data.savedInspirations.map((r) => r.id)).toEqual(["inspiration-custom", "inspiration-ramen"]);
    expect(data.savedInspirations[0]).toMatchObject({ imageKey: "panang-karry", cuisine: "Thailand" });
    expect(data.savedInspirations[0]?.imageUrl).toBeUndefined();
    expect(warnings.some((w) => w.includes("inspiration-borte"))).toBe(true);
  });

  it("does not warn about unknown dishes for meals that reference catalog or custom dishes", () => {
    expect(warnings.some((w) => w.includes("ukendt ret"))).toBe(false);
  });
});

describe("migrateV1: tolerated legacy shapes and problems", () => {
  it("accepts a sparse early v1 record", () => {
    const result = migrate({ version: 1, meals: { "2026-10-20": { dishId: "lasagne", status: "planned", note: "", locked: false } } });
    expect(result.data.meals["2026-10-20"]).toEqual({ dishId: "lasagne", locked: false, note: "", source: "manual" });
    expect(result.data).toMatchObject({ dishes: [], profiles: [], fridge: [], pantry: [], shoppingLists: {}, savedInspirations: [] });
    expect(result.data.settings).toEqual({ globalExclusions: [], preferredStores: [] });
    expect(result.warnings).toEqual([]);
  });

  it("warns about sentence-like exclusions that will not match single ingredients", () => {
    const result = migrate({ version: 1, meals: {}, globalExclusions: "svampe, meget stærk mad eller retter med tun" });
    expect(result.data.settings.globalExclusions).toEqual(["svampe", "meget stærk mad eller retter med tun"]);
    expect(result.warnings).toEqual([expect.stringContaining("meget stærk mad eller retter med tun")]);
  });

  it("rejects unknown formats", () => {
    expect(migrateV1(null, { now: NOW }).ok).toBe(false);
    expect(migrateV1({ version: 2, meals: {} }, { now: NOW }).ok).toBe(false);
    expect(migrateV1({ version: 1 }, { now: NOW })).toMatchObject({ ok: false, error: expect.stringMatching(/version 1/u) });
  });

  it("drops invalid entries with warnings instead of failing", () => {
    const { data, warnings } = migrate({
      version: 1,
      meals: { "not-a-date": { dishId: "x" }, "2026-10-20": { dishId: 5 }, "2026-10-21": { dishId: "ghost", status: "planned", note: 1, locked: "yes" } },
      household: [{ id: "a", name: "A" }, { id: "a", name: "Dup" }, { name: "Ingen id" }],
      customDishes: [{ id: "bad" }],
      history: [{ date: "2026-10-01", status: "eaten" }, { date: "2026-10-21", dishId: "other", status: "eaten" }, { date: "2026-10-21", dishId: "ghost", status: "eaten" }],
    });
    expect(Object.keys(data.meals)).toEqual(["2026-10-21"]);
    expect(data.meals["2026-10-21"]).toEqual({ dishId: "ghost", locked: false, note: "", source: "manual" });
    expect(data.profiles.map((p) => p.id)).toEqual(["a"]);
    expect(data.dishes).toEqual([]);
    const text = warnings.join("\n");
    expect(text).toContain("not-a-date");
    expect(text).toContain("2026-10-20");
    expect(text).toMatch(/Dup/u);
    expect(text).toMatch(/gemt ret/u);
    expect(text).toMatch(/anden ret/u);
    expect(text).toMatch(/Flere historikposter/u);
    expect(text).toMatch(/ukendt ret/u);
  });

  it("prefers the meal's skipped status over eaten history", () => {
    const { data, warnings } = migrate({
      version: 1,
      meals: { "2026-10-21": { dishId: "tacos", status: "skipped", note: "", locked: false } },
      history: [{ date: "2026-10-21", dishId: "tacos", status: "eaten" }],
    });
    expect(data.meals["2026-10-21"]?.skipped).toBe(true);
    expect(warnings.some((w) => w.includes("både spist og sprunget over"))).toBe(true);
  });

  it("is pure: does not mutate its input and is repeatable", () => {
    const input = fixture();
    const snapshot: unknown = JSON.parse(JSON.stringify(input));
    const first = migrate(input);
    expect(input).toEqual(snapshot);
    expect(migrate(input)).toEqual(first);
  });
});
