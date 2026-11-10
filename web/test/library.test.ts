import { describe, expect, it } from "vitest";
import type { Dish } from "@madplan/domain";
import { categoriesOf, filterDishes, lastEatenLabel, plural, sortDishes } from "../src/lib/library";
import { addChips, parseChipInput, parseLines, removeChip } from "../src/lib/chips";
import { draftToInput, emptyDraft, validateDraft } from "../src/lib/dish-form";

const dish = (id: string, name: string, extra: Partial<Dish> = {}): Dish => ({
  id,
  name,
  ingredients: ["løg"],
  prepMinutes: 30,
  category: "Dansk",
  favorite: false,
  leftoverFriendly: false,
  freezerFriendly: false,
  ...extra,
});

const dishes = [
  dish("a", "Åkande-suppe", { category: "Suppe", prepMinutes: 20, ingredients: ["porre"] }),
  dish("b", "Boller i karry", { prepMinutes: 45, ingredients: ["kylling", "karry"] }),
  dish("c", "Citrontærte", { category: "Dessert", prepMinutes: 10 }),
];

describe("library search / filter / sort", () => {
  it("searches name, category and ingredient case-insensitively", () => {
    expect(filterDishes(dishes, "KARRY", null).map((d) => d.id)).toEqual(["b"]);
    expect(filterDishes(dishes, "dessert", null).map((d) => d.id)).toEqual(["c"]);
    expect(filterDishes(dishes, "porre", null).map((d) => d.id)).toEqual(["a"]);
    expect(filterDishes(dishes, "  ", null)).toHaveLength(3);
  });

  it("filters by category", () => {
    expect(filterDishes(dishes, "", "Suppe").map((d) => d.id)).toEqual(["a"]);
    expect(categoriesOf(dishes)).toEqual(["Dansk", "Dessert", "Suppe"]);
  });

  it("sorts A-Å with Danish collation (Å last)", () => {
    expect(sortDishes(dishes, "name", new Map()).map((d) => d.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by quickest and by most recently eaten with never-tried last", () => {
    expect(sortDishes(dishes, "quick", new Map()).map((d) => d.id)).toEqual(["c", "a", "b"]);
    const last = new Map([
      ["a", "2026-11-01"],
      ["b", "2026-11-05"],
    ]);
    expect(sortDishes(dishes, "recent", last).map((d) => d.id)).toEqual(["b", "a", "c"]);
  });

  it("uses Danish singular and plural", () => {
    expect(plural(1, "gang", "gange")).toBe("1 gang");
    expect(plural(2, "gang", "gange")).toBe("2 gange");
  });

  it("describes when a dish was last eaten", () => {
    expect(lastEatenLabel(undefined, "2026-11-09")).toBe("Ikke prøvet");
    expect(lastEatenLabel("2026-11-09", "2026-11-09")).toBe("Spist i dag");
    expect(lastEatenLabel("2026-11-08", "2026-11-09")).toBe("Spist i går");
    expect(lastEatenLabel("2026-11-02", "2026-11-09")).toBe("Spist for 7 dage siden");
    expect(lastEatenLabel("2026-10-12", "2026-11-09")).toBe("Spist for 4 uger siden");
  });
});

describe("chip parsing", () => {
  it("splits on comma, semicolon and newline", () => {
    expect(parseChipInput(" løg, hvidløg;peber\n ")).toEqual(["løg", "hvidløg", "peber"]);
  });

  it("adds without case-insensitive duplicates and removes", () => {
    const next = addChips(["Løg"], "løg, Porre, porre");
    expect(next).toEqual(["Løg", "Porre"]);
    expect(removeChip(next, "Løg")).toEqual(["Porre"]);
  });

  it("parses textarea lines", () => {
    expect(parseLines("a\r\n\n b \n")).toEqual(["a", "b"]);
  });
});

describe("dish form", () => {
  it("validates with Danish messages", () => {
    const errors = validateDraft({ ...emptyDraft(), prepMinutes: "0", sourceUrl: "ftp://x" });
    expect(errors.name).toBe("Giv retten et navn.");
    expect(errors.category).toBeTruthy();
    expect(errors.prepMinutes).toContain("minutter");
    expect(errors.ingredients).toContain("ingrediens");
    expect(errors.sourceUrl).toContain("http");
  });

  it("builds the payload and keeps the bundled image key when no image was set", () => {
    const draft = { ...emptyDraft(), name: " Suppe ", category: "Suppe", ingredients: "løg\nporre", steps: "Kog." };
    const input = draftToInput(draft, dish("x", "Suppe", { imageKey: "suppe" }));
    expect(input).toMatchObject({ name: "Suppe", ingredients: ["løg", "porre"], instructions: ["Kog."], imageKey: "suppe" });
    expect(validateDraft(draft)).toEqual({});
  });
});
