import { describe, expect, it } from "vitest";
import { baseServings, scaleIngredient, scaleIngredients, targetServings } from "../src/index.ts";

describe("portions", () => {
  it("scales recipe ingredients from the default four servings", () => {
    expect(scaleIngredient("500 g hakket oksekød", 2)).toBe("250 g hakket oksekød");
    expect(scaleIngredient("2 dåser hakkede tomater", 6)).toBe("3 dåser hakkede tomater");
    expect(scaleIngredient("4 æg", 3)).toBe("3 æg");
    expect(scaleIngredient("salt efter smag", 8)).toBe("salt efter smag");
    expect(scaleIngredient("1 løg", 4)).toBe("1 løg");
    expect(scaleIngredients(["400 g pasta", "1 løg"], 8)).toEqual(["800 g pasta", "2 løg"]);
  });

  it("serves the household count with safe defaults and an explicit override", () => {
    expect(baseServings(undefined)).toBe(4);
    expect(baseServings(6)).toBe(6);
    expect(baseServings(0)).toBe(4);
    expect(baseServings(2.5)).toBe(4);
    expect(targetServings(0)).toBe(4);
    expect(targetServings(3)).toBe(3);
    expect(targetServings(3, 5)).toBe(5);
    expect(targetServings(3, 100)).toBe(3);
  });

  it("keeps decimals for half-size portions", () => {
    expect(scaleIngredient("500 g kylling", 2.5)).toBe("312,5 g kylling");
    expect(targetServings(2.5)).toBe(2.5);
  });

  it("scales fractions and decimal comma amounts, and ignores invalid servings", () => {
    expect(scaleIngredient("1/2 citron", 8)).toBe("1 citron");
    expect(scaleIngredient("1,5 dl fløde", 8)).toBe("3 dl fløde");
    expect(scaleIngredient("500 g mel", 0.1)).toBe("500 g mel");
    expect(scaleIngredient("500 g mel", 8, 0)).toBe("500 g mel");
    expect(scaleIngredient("1/0 citron", 8)).toBe("1/0 citron");
    // No thousands separator, so the shopping parser reads the result back correctly.
    expect(scaleIngredient("500 g mel", 8)).toBe("1000 g mel");
  });
});
