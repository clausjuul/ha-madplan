import { describe, expect, it } from "vitest";
import { DISHES, containsTerm, createLocalSuggestions, daysInRange, matchingFridgeItems, rankAlternatives, eatenHistory, lastEatenByDish } from "../src/index.ts";
import type { MealMap, SuggestionInput } from "../src/index.ts";
import { dish, meal, profile } from "./fixtures.ts";

const days = daysInRange("2026-11-09", "2026-11-15");
const base: SuggestionInput = { days, meals: {}, fridge: [], lastEaten: new Map(), seed: 1 };
const ids = (result: { dishId?: string }[]) => result.map((item) => item.dishId);

describe("createLocalSuggestions", () => {
  it("is deterministic for the same seed and varies with another", () => {
    const a = createLocalSuggestions(base);
    expect(createLocalSuggestions(base)).toEqual(a);
    expect(ids(createLocalSuggestions({ ...base, seed: 2 }))).not.toEqual(ids(a));
  });

  it("does not call Math.random", () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error("Math.random must not be used");
    };
    try {
      expect(createLocalSuggestions(base)).toHaveLength(7);
    } finally {
      Math.random = original;
    }
  });

  it("fills every day with unique dishes marked as local, unlocked drafts", () => {
    const result = createLocalSuggestions(base);
    expect(result.map((item) => item.date)).toEqual(days);
    expect(new Set(ids(result)).size).toBe(7);
    expect(result.every((item) => item.source === "local" && !item.locked && item.reason.length > 0)).toBe(true);
  });

  it("leaves locked days alone and does not reuse their dish", () => {
    const meals: MealMap = { "2026-11-10": meal("lasagne", { locked: true }) };
    const result = createLocalSuggestions({ ...base, meals });
    expect(result.some((item) => item.date === "2026-11-10")).toBe(false);
    expect(ids(result)).not.toContain("lasagne");
  });

  it("never suggests archived dishes or dishes hitting global or profile exclusions", () => {
    const catalog = [
      dish({ id: "a", name: "Rejewok", ingredients: ["400 g rejer"] }),
      dish({ id: "b", name: "Kyllingsalat", ingredients: ["300 g kylling"] }),
      dish({ id: "c", name: "Gammel", archivedAt: "2026-01-01T00:00:00Z" }),
      dish({ id: "d", name: "Linsegryde", ingredients: ["500 g linser"] }),
    ];
    const result = createLocalSuggestions({
      ...base,
      days: days.slice(0, 4),
      dishes: catalog,
      globalExclusions: ["rejer"],
      profiles: [profile({ id: "p", name: "P", exclusions: ["kylling"] })],
    });
    // Only "d" is eligible; with no alternative it is reused rather than breaking an exclusion.
    expect(new Set(ids(result))).toEqual(new Set(["d"]));
  });

  it("places required dishes first and still obeys exclusions for them", () => {
    const result = createLocalSuggestions({
      ...base,
      days: days.slice(0, 3),
      requiredDishIds: ["lasagne", "carbonara", "lasagne", "findes-ikke"],
      globalExclusions: ["bacon"],
    });
    expect(result[0]).toMatchObject({ dishId: "lasagne", reason: "Valgt på forhånd til denne uge." });
    expect(ids(result)).not.toContain("carbonara");
  });

  it("prefers dishes that use the fridge and explains it", () => {
    const result = createLocalSuggestions({ ...base, days: ["2026-11-09"], fridge: [{ name: "lasagneplader" }] });
    expect(result[0]).toMatchObject({ dishId: "lasagne", reason: "Bruger lasagneplader fra køleskabet." });
  });

  it("prefers a dish that uses a fridge item expiring soon and says so", () => {
    const dishes = [
      dish({ id: "a", name: "Spinatsuppe", ingredients: ["spinat"] }),
      dish({ id: "b", name: "Kyllingepasta", ingredients: ["kylling", "pasta"] }),
    ];
    const result = createLocalSuggestions({
      ...base,
      days: ["2026-11-09"],
      dishes,
      fridge: [{ name: "kylling" }, { name: "pasta" }, { name: "spinat", expiresOn: "2026-11-10" }],
    });
    expect(result[0]).toMatchObject({ dishId: "a", reason: "Bruger spinat, der udløber i morgen." });
  });

  it("matches fridge items on word edges, not inside words", () => {
    expect(containsTerm("flødeost", "ost")).toBe(true);
    expect(containsTerm("500 g basmatiris", "ris")).toBe(true);
    expect(containsTerm("rostbøf", "ost")).toBe(false);
    expect(containsTerm("chorizo", "ris")).toBe(false);
    expect(matchingFridgeItems(["rostbøf"], [{ name: "ost" }])).toEqual([]);
  });

  it("favours dishes not eaten recently and explains it", () => {
    const meals: MealMap = { "2026-11-08": meal("recent"), "2026-10-10": meal("old") };
    const lastEaten = lastEatenByDish(eatenHistory(meals, "2026-11-09"));
    const result = createLocalSuggestions({
      ...base,
      days: ["2026-11-09"],
      lastEaten,
      dishes: [dish({ id: "recent", name: "Nylig" }), dish({ id: "old", name: "Gammel" })],
    });
    expect(result[0]).toMatchObject({ dishId: "old", reason: "Ikke spist i 30 dage." });
  });

  it("falls back to a generic reason for never-eaten dishes", () => {
    const result = createLocalSuggestions({ ...base, days: ["2026-11-09"], dishes: [dish({ id: "x", name: "Ny" })] });
    expect(result[0]?.reason).toBe("Giver variation i ugens retter.");
  });

  it("honours a day-specific quick wish", () => {
    const result = createLocalSuggestions({ ...base, days: ["2026-11-09"], dayRequests: { "2026-11-09": "hurtig" } });
    const chosen = DISHES.find((d) => d.id === result[0]?.dishId);
    expect(chosen?.prepMinutes).toBeLessThanOrEqual(30);
    expect(result[0]?.reason).toBe("Matcher ønsket til denne dag.");
  });

  it("honours free text requests", () => {
    const result = createLocalSuggestions({ ...base, days: ["2026-11-09"], userRequest: "gerne noget med kebab" });
    expect(result[0]?.reason).toBe("Matcher ønsket, du skrev til madplanen.");
    const chosen = DISHES.find((d) => d.id === result[0]?.dishId);
    expect([chosen?.name, ...(chosen?.ingredients ?? [])].join(" ").toLowerCase()).toContain("kebab");
  });

  it("returns nothing when every dish is excluded", () => {
    expect(createLocalSuggestions({ ...base, dishes: [dish({ id: "a", name: "Rejer", ingredients: ["rejer"] })], globalExclusions: ["rejer"] })).toEqual([]);
  });
});

describe("rankAlternatives", () => {
  const dishes = [
    dish({ id: "a", name: "A", category: "Pasta" }),
    dish({ id: "b", name: "B", category: "Pasta" }),
    dish({ id: "c", name: "C", category: "Suppe", ingredients: ["spinat"] }),
    dish({ id: "d", name: "D", category: "Fisk" }),
    dish({ id: "x", name: "X", ingredients: ["rejer"] }),
  ];
  it("offers distinct, allowed dishes with reasons and skips the rest of the draft", () => {
    const result = rankAlternatives({
      ...base,
      dishes,
      day: "2026-11-09",
      otherDays: [{ date: "2026-11-10", dishId: "a" }],
      excludeDishIds: ["d"],
      fridge: [{ name: "spinat", expiresOn: "2026-11-09" }],
      globalExclusions: ["rejer"],
    });
    expect(result.map((entry) => entry.dish.id)).toEqual(["c", "b"]);
    expect(result[0]?.reason).toBe("Bruger spinat, der udløber i dag.");
  });
});
