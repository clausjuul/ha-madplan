import { describe, expect, it } from "vitest";
import { ingredientsForStep, scaledLines, splitIngredient } from "../src/lib/cook-model";

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

  it("reads the units recipe sites write", () => {
    expect(splitIngredient("400 gr hakket oksekød")).toEqual({ amount: "400 gr", name: "hakket oksekød" });
    expect(splitIngredient("2 spiseskeer olie")).toEqual({ amount: "2 spiseskeer", name: "olie" });
  });

  it("finds the ingredients a step uses", () => {
    const lines = [
      "400 g hakket oksekød",
      "1 løg (hakket)",
      "2 fed hvidløg (hakkede)",
      "500 g kartofler (skrællede og skåret i tynde skiver)",
      "5 dl mælk",
      "75 g revet ost (fx mozzarella)",
      "1 spsk. olie",
      "salt og peber",
    ].map(splitIngredient);
    const names = (step: string): string[] => ingredientsForStep(step, lines).map((line) => `${line.amount} ${line.name}`.trim());

    expect(names("Varm olien i en gryde, og brun oksekødet sammen med løget og hvidløget.")).toEqual([
      "400 g hakket oksekød",
      "1 løg (hakket)",
      "2 fed hvidløg (hakkede)",
      "1 spsk. olie",
    ]);
    expect(names("Læg kartoflerne i bunden af fadet og hæld mælken over.")).toEqual([
      "500 g kartofler (skrællede og skåret i tynde skiver)",
      "5 dl mælk",
    ]);
    expect(names("Drys med osten og smag til med salt og peber.")).toEqual(["75 g revet ost (fx mozzarella)", "salt og peber"]);
    expect(names("Bag lasagnen i 40 minutter.")).toEqual([]);
  });
});
