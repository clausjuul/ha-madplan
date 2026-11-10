import { describe, expect, it } from "vitest";
import {
  EMPTY_SHOPPING_STATE,
  addExtra,
  categorizeIngredient,
  clearChecked,
  createShoppingList,
  extraItemId,
  formatQuantity,
  ingredientsMatch,
  parseIngredient,
  parseOfferPrice,
  removeExtra,
  toggleChecked,
} from "../src/index.ts";
import type { MealMap, ShoppingListState } from "../src/index.ts";
import { dish, meal } from "./fixtures.ts";

const dishes = [
  dish({
    id: "bolognese",
    name: "Bolognese",
    ingredients: ["500 g hakket oksekød", "400 g pasta", "2 dåser hakkede tomater", "1 løg", "salt efter smag"],
  }),
  dish({
    id: "lasagne",
    name: "Lasagne",
    ingredients: ["500 g hakket oksekød", "12 lasagneplader", "2 dåser hakkede tomater", "1 løg"],
  }),
  dish({ id: "takeaway", name: "Takeaway", ingredients: [] }),
];

function list(meals: MealMap, extra: Partial<Parameters<typeof createShoppingList>[0]> = {}) {
  return createShoppingList({
    listId: "l1",
    from: "2026-11-09",
    to: "2026-11-15",
    meals,
    dishes,
    fridge: [],
    pantry: [],
    ...extra,
  });
}

describe("ingredient parsing", () => {
  it("normalises units", () => {
    expect(parseIngredient("1,5 kg kartofler")).toEqual({ name: "kartofler", amount: 1500, unit: "g" });
    expect(parseIngredient("2 dl fløde")).toEqual({ name: "fløde", amount: 200, unit: "ml" });
    expect(parseIngredient("3 dåser tomater")).toEqual({ name: "tomater", amount: 3, unit: "can" });
    expect(parseIngredient("2 løg")).toEqual({ name: "løg", amount: 2, unit: "count" });
    expect(parseIngredient("salt efter smag")).toEqual({ name: "salt efter smag" });
  });

  it("treats fed, skiver, knivspids and nip as units, not part of the name", () => {
    expect(parseIngredient("2 fed hvidløg")).toEqual({ name: "hvidløg", amount: 2, unit: "count" });
    expect(parseIngredient("4 skiver rugbrød")).toEqual({ name: "rugbrød", amount: 4, unit: "count" });
    expect(parseIngredient("1 knivspids stødt kanel")).toEqual({ name: "stødt kanel", amount: 1, unit: "count" });
    expect(parseIngredient("1 nip salt")).toEqual({ name: "salt", amount: 1, unit: "count" });
    expect(parseIngredient("1,5 dl mælk")).toEqual({ name: "mælk", amount: 150, unit: "ml" });
    expect(parseIngredient("2 fedtfattige yoghurt").name).toBe("fedtfattige yoghurt");
  });

  it("formats quantities in Danish", () => {
    expect(formatQuantity(1500, "g")).toBe("1,5 kg");
    expect(formatQuantity(250, "ml")).toBe("2,5 dl");
    expect(formatQuantity(1, "can")).toBe("1 dåse");
    expect(formatQuantity(2, "can")).toBe("2 dåser");
    expect(formatQuantity(undefined, undefined)).toBe("Mængde ikke angivet");
  });

  it("matches loosely but never on very short names", () => {
    expect(ingredientsMatch("hakket oksekød", "oksekød")).toBe(true);
    expect(ingredientsMatch("ris", "rismel")).toBe(false);
    expect(ingredientsMatch("ris", "Ris")).toBe(true);
    expect(ingredientsMatch("", "ris")).toBe(false);
  });

  it("categorises with whole-word frost handling", () => {
    expect(categorizeIngredient("ris")).toBe("Kolonial");
    expect(categorizeIngredient("frosne ærter")).toBe("Frost");
    expect(categorizeIngredient("is")).toBe("Frost");
    expect(categorizeIngredient("hakket oksekød")).toBe("Kød og fisk");
    expect(categorizeIngredient("mælk")).toBe("Køl");
    expect(categorizeIngredient("tortilla")).toBe("Brød");
    expect(categorizeIngredient("gulerødder")).toBe("Frugt og grønt");
    expect(categorizeIngredient("vaskemiddel")).toBe("Andet");
  });

  it("reads offer prices", () => {
    expect(parseOfferPrice("2 for 30")).toBe(30);
    expect(parseOfferPrice("12,95 kr.")).toBe(12.95);
    expect(parseOfferPrice("gratis")).toBeUndefined();
  });
});

describe("createShoppingList", () => {
  const meals: MealMap = {
    "2026-11-09": meal("bolognese"),
    "2026-11-11": meal("lasagne"),
  };

  it("merges quantities across dishes and names the dishes", () => {
    const result = list(meals);
    const beef = result.items.find((item) => item.label === "hakket oksekød");
    expect(beef?.quantityLabel).toBe("1 kg");
    expect(beef?.dishNames).toEqual(["Bolognese", "Lasagne"]);
    expect(result.items.find((item) => item.label === "hakkede tomater")?.quantityLabel).toBe("4 dåser");
    expect(result.items.find((item) => item.label === "løg")?.quantityLabel).toBe("2 stk.");
    expect(result.items.find((item) => item.label === "salt efter smag")?.quantityLabel).toBe("Mængde ikke angivet");
  });

  it("builds for an arbitrary range, not a calendar week", () => {
    const wide = list(meals, { from: "2026-11-10", to: "2026-11-11" });
    expect(wide.items.some((item) => item.label === "pasta")).toBe(false);
    expect(wide.items.some((item) => item.label === "lasagneplader")).toBe(true);
    const outside = list(meals, { from: "2026-11-12", to: "2026-11-20" });
    expect(outside.items).toEqual([]);
    const reversed = list(meals, { from: "2026-11-15", to: "2026-11-09" });
    expect(reversed.items).toEqual([]);
  });

  it("skips skipped meals, unknown dishes and empty dishes", () => {
    const result = list({
      "2026-11-09": meal("bolognese", { skipped: true }),
      "2026-11-10": meal("findes-ikke"),
      "2026-11-11": meal("takeaway"),
    });
    expect(result.items).toEqual([]);
  });

  it("excludes fridge and pantry items and counts them", () => {
    const result = list(meals, {
      fridge: [{ name: "oksekød" }],
      pantry: ["salt", "løg"],
    });
    const labels = result.items.map((item) => item.label);
    expect(labels).not.toContain("hakket oksekød");
    expect(labels).not.toContain("løg");
    expect(result.excludedCount).toBe(5);
  });

  it("estimates package-based prices and totals them", () => {
    const result = list({ "2026-11-09": meal("bolognese") });
    const beef = result.items.find((item) => item.label === "hakket oksekød");
    expect(beef?.estimatedPrice).toBe(45);
    expect(beef?.priceLabel).toBe("ca. 45 kr.");
    expect(result.totalEstimatedPrice).toBe(result.items.reduce((sum, item) => sum + item.estimatedPrice, 0));
  });

  it("scales ingredients to the wanted servings", () => {
    const result = list({ "2026-11-09": meal("bolognese") }, { servings: 8 });
    expect(result.items.find((item) => item.label === "hakket oksekød")?.quantityLabel).toBe("1 kg");
    expect(result.items.find((item) => item.label === "pasta")?.quantityLabel).toBe("800 g");
  });

  it("uses an offer price when the meal carries a matching offer", () => {
    const offer = { store: "Netto" as const, item: "oksekød", price: "2 for 60", sourceUrl: "https://example.com" };
    const result = list({ "2026-11-09": meal("bolognese", { offer }) });
    const beef = result.items.find((item) => item.label === "hakket oksekød");
    expect(beef?.priceIsOffer).toBe(true);
    expect(beef?.estimatedPrice).toBe(60);
    expect(beef?.priceLabel).toBe("2 for 60 · Netto");
    expect(result.offerItemCount).toBe(1);
  });

  it("adds extras and applies checked state keyed by the list", () => {
    const state: ShoppingListState = {
      checked: ["ingredient:pasta:g", extraItemId("2 liter mælk")],
      extras: [{ label: "2 liter mælk" }, { label: "  " }],
    };
    const result = list({ "2026-11-09": meal("bolognese") }, { state });
    const milk = result.items.find((item) => item.extra);
    expect(milk).toMatchObject({ label: "mælk", quantityLabel: "2 liter", checked: true, category: "Køl" });
    expect(result.items.filter((item) => item.extra)).toHaveLength(1);
    expect(result.items.find((item) => item.label === "pasta")?.checked).toBe(true);
    expect(result.checkedCount).toBe(2);
    expect(result.listId).toBe("l1");
  });
});

describe("shopping state reducers", () => {
  it("toggles checks", () => {
    const once = toggleChecked(EMPTY_SHOPPING_STATE, "a");
    expect(once.checked).toEqual(["a"]);
    expect(toggleChecked(once, "a").checked).toEqual([]);
    expect(EMPTY_SHOPPING_STATE.checked).toEqual([]);
  });

  it("adds extras without blanks or case-insensitive duplicates", () => {
    const state = addExtra(EMPTY_SHOPPING_STATE, "  Mælk ");
    expect(state.extras).toEqual([{ label: "Mælk" }]);
    expect(addExtra(state, "mælk")).toBe(state);
    expect(addExtra(state, "   ")).toBe(state);
  });

  it("removes an extra together with its checked mark, and clears checks", () => {
    const state: ShoppingListState = {
      checked: [extraItemId("Mælk"), "x"],
      extras: [{ label: "Mælk" }],
    };
    expect(removeExtra(state, "Mælk")).toEqual({ checked: ["x"], extras: [] });
    expect(clearChecked(state)).toEqual({ checked: [], extras: [{ label: "Mælk" }] });
  });
});
