import { describe, expect, it } from "vitest";
import { scaledLines, splitIngredient } from "../src/lib/cook-model";

describe("cook model", () => {
  it("splits quantity and name, also for fraction glyphs", () => {
    expect(splitIngredient("500 g hakket oksekød")).toEqual({ amount: "500 g", name: "hakket oksekød" });
    expect(splitIngredient("1½ dåse hakkede tomater")).toEqual({ amount: "1½ dåse", name: "hakkede tomater" });
    expect(splitIngredient("¾ løg")).toEqual({ amount: "¾", name: "løg" });
    expect(splitIngredient("muskat, salt og peber")).toEqual({ amount: "", name: "muskat, salt og peber" });
  });

  it("scales for 3 people with friendly fractions", () => {
    const lines = scaledLines({ ingredients: ["1 løg", "2 dåser hakkede tomater", "500 g oksekød"], servings: 4 }, 3);
    expect(lines.map((line) => `${line.amount} ${line.name}`)).toEqual([
      "¾ løg",
      "1½ dåse hakkede tomater",
      "380 g oksekød",
    ]);
  });
});
