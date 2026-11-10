import { describe, expect, it } from "vitest";
import { DISHES, categorizeIngredient, parseIngredient } from "../src/index.ts";

/** Ingredients that genuinely have no shop aisle of their own. Keep this list short and deliberate. */
const GENUINELY_OTHER = new Set<string>([]);

describe("ingredient categories", () => {
  it("puts no built-in dish ingredient in 'Andet' unless explicitly allowed", () => {
    const offenders = new Set<string>();
    for (const dish of DISHES) {
      for (const text of dish.ingredients) {
        const { name } = parseIngredient(text);
        if (categorizeIngredient(name) === "Andet" && !GENUINELY_OTHER.has(name)) offenders.add(name);
      }
    }
    expect([...offenders].sort()).toEqual([]);
  });

  it.each([
    ["kartofler", "Frugt og grønt"],
    ["gulerødder", "Frugt og grønt"],
    ["porrer", "Frugt og grønt"],
    ["squash", "Frugt og grønt"],
    ["rød peberfrugt", "Frugt og grønt"],
    ["champignon", "Frugt og grønt"],
    ["frisk ingefær", "Frugt og grønt"],
    ["rød chili", "Frugt og grønt"],
    ["dild", "Frugt og grønt"],
    ["purløg", "Frugt og grønt"],
    ["hakkede tomater", "Kolonial"],
    ["tomatpuré", "Kolonial"],
    ["kokosmælk", "Kolonial"],
    ["mælk", "Køl"],
    ["frikadeller", "Kød og fisk"],
  ])("%s -> %s", (name, category) => {
    expect(categorizeIngredient(name)).toBe(category);
  });
});
