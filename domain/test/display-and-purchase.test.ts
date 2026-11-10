import { describe, expect, it } from "vitest";
import {
  createShoppingList,
  formatQuantity,
  roundUpForPurchase,
  scaleIngredientForDisplay,
  scaleIngredientsForDisplay,
} from "../src/index.ts";
import type { Dish } from "../src/index.ts";

describe("display scaling (cooking mode)", () => {
  it("writes countable amounts as friendly fractions, nearest quarter", () => {
    expect(scaleIngredientForDisplay("1 løg", 3)).toBe("¾ løg");
    expect(scaleIngredientForDisplay("2 dåser hakkede tomater", 3)).toBe("1½ dåse hakkede tomater");
    expect(scaleIngredientForDisplay("2 limefrugter", 3)).toBe("1½ limefrugter");
    expect(scaleIngredientForDisplay("1/2 citron", 4)).toBe("½ citron");
    expect(scaleIngredientForDisplay("3 dåser majs", 8)).toBe("6 dåser majs");
    expect(scaleIngredientForDisplay("1 dåse tomater", 8)).toBe("2 dåser tomater");
    expect(scaleIngredientForDisplay("1 potte basilikum", 3)).toBe("¾ potte basilikum");
    expect(scaleIngredientForDisplay("1 løg", 1)).toBe("¼ løg");
  });

  it("rounds spoons to halves and grams/ml to tidy steps", () => {
    expect(scaleIngredientForDisplay("2 spsk. tomatpuré", 3)).toBe("1½ spsk. tomatpuré");
    expect(scaleIngredientForDisplay("1 tsk. salt", 3)).toBe("1 tsk. salt");
    expect(scaleIngredientForDisplay("500 g hakket oksekød", 3)).toBe("380 g hakket oksekød");
    expect(scaleIngredientForDisplay("50 g smør", 3)).toBe("40 g smør");
    expect(scaleIngredientForDisplay("6 dl mælk", 3)).toBe("4½ dl mælk");
    expect(scaleIngredientForDisplay("1 kg kartofler", 3)).toBe("0,75 kg kartofler");
  });

  it("leaves free text and invalid servings alone", () => {
    expect(scaleIngredientForDisplay("salt og peber", 3)).toBe("salt og peber");
    expect(scaleIngredientForDisplay("2 løg", 0)).toBe("2 løg");
    expect(scaleIngredientsForDisplay(["1 løg", "muskat"], 3)).toEqual(["¾ løg", "muskat"]);
  });
});

describe("purchase rounding (shopping list)", () => {
  it("rounds discrete units up to whole units", () => {
    expect(roundUpForPurchase(5.25, "can")).toBe(6);
    expect(roundUpForPurchase(0.75, "count")).toBe(1);
    expect(roundUpForPurchase(1.5, "count")).toBe(2);
    expect(roundUpForPurchase(0.75, "pot")).toBe(1);
    expect(roundUpForPurchase(2, "package")).toBe(2);
  });

  it("rounds weights and volumes up to sensible steps", () => {
    expect(roundUpForPurchase(63, "g")).toBe(70);
    expect(roundUpForPurchase(375, "g")).toBe(400);
    expect(roundUpForPurchase(1010, "g")).toBe(1050);
    expect(roundUpForPurchase(120, "ml")).toBe(150);
    expect(roundUpForPurchase(1260, "ml")).toBe(1300);
    expect(formatQuantity(roundUpForPurchase(1260, "ml"), "ml")).toBe("1,3 liter");
    expect(formatQuantity(roundUpForPurchase(1010, "g"), "g")).toBe("1,05 kg");
  });

  it("lists whole, priced quantities", () => {
    const dish: Dish = {
      id: "t",
      name: "Test",
      servings: 4,
      ingredients: ["2 dåser hakkede tomater", "1 løg", "500 g hakket oksekød"],
      prepMinutes: 10,
      category: "Test",
      favorite: false,
      leftoverFriendly: false,
      freezerFriendly: false,
    };
    const list = createShoppingList({
      listId: "x",
      from: "2026-11-09",
      to: "2026-11-09",
      meals: { "2026-11-09": { dishId: "t", locked: false, note: "", source: "manual" } },
      dishes: [dish],
      fridge: [],
      pantry: [],
      servings: 3,
    });
    const label = (name: string) => list.items.find((item) => item.label.includes(name));
    expect(label("tomater")?.quantityLabel).toBe("2 dåser");
    expect(label("løg")?.quantityLabel).toBe("1 stk.");
    expect(label("oksekød")?.quantityLabel).toBe("400 g");
    // Price uses the rounded quantity: 400 g beef is one 500 g package.
    expect(label("oksekød")?.estimatedPrice).toBe(45);
  });
});
