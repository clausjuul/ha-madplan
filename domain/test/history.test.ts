import { describe, expect, it } from "vitest";
import { buildPlanningContext, createHistoryInsights, eatenHistory, lastEatenByDish, neverAgainDishIds, ratingScores } from "../src/index.ts";
import type { MealMap } from "../src/index.ts";
import { dish, meal } from "./fixtures.ts";

const today = "2026-11-09";
const meals: MealMap = {
  "2026-11-02": meal("lasagne"),
  "2026-11-03": meal("tacos"),
  "2026-11-04": meal("lasagne"),
  "2026-11-05": meal("carbonara", { skipped: true }),
  "2026-11-09": meal("tacos"),
  "2026-11-10": meal("tacos"),
};
const dishes = [
  dish({ id: "lasagne", name: "Lasagne" }),
  dish({ id: "tacos", name: "Tacos" }),
  dish({ id: "carbonara", name: "Carbonara" }),
  dish({ id: "gammel", name: "Gammel ret", archivedAt: "2026-01-01T00:00:00Z" }),
  dish({ id: "ny", name: "Ny ret" }),
];

describe("eatenHistory", () => {
  it("counts only past, non-skipped meals, newest first", () => {
    expect(eatenHistory(meals, today)).toEqual([
      { date: "2026-11-04", dishId: "lasagne" },
      { date: "2026-11-03", dishId: "tacos" },
      { date: "2026-11-02", dishId: "lasagne" },
    ]);
  });

  it("does not count today or the future as eaten", () => {
    expect(eatenHistory(meals, "2026-11-02")).toEqual([]);
  });

  it("derives the last eaten date per dish", () => {
    expect([...lastEatenByDish(eatenHistory(meals, today))]).toEqual([
      ["lasagne", "2026-11-04"],
      ["tacos", "2026-11-03"],
    ]);
  });
});

describe("createHistoryInsights", () => {
  const insights = createHistoryInsights(meals, dishes, today);

  it("ranks most eaten and longest since", () => {
    expect(insights.mostEaten.map((s) => [s.dish.id, s.count])).toEqual([
      ["lasagne", 2],
      ["tacos", 1],
    ]);
    expect(insights.longestSince.map((s) => s.dish.id)).toEqual(["tacos", "lasagne"]);
  });

  it("lists never-tried dishes but never archived ones", () => {
    expect(insights.neverTried.map((s) => s.dish.id)).toEqual(["carbonara", "ny"]);
  });

  it("exposes lookups and respects the limit", () => {
    expect(insights.byDishId.get("lasagne")?.lastDate).toBe("2026-11-04");
    expect(insights.lastEatenByDish.get("tacos")).toBe("2026-11-03");
    expect(createHistoryInsights(meals, dishes, today, 1).mostEaten).toHaveLength(1);
  });

  it("ignores meals whose dish is unknown", () => {
    const result = createHistoryInsights({ "2026-11-01": meal("spoegelse") }, dishes, today);
    expect(result.mostEaten).toEqual([]);
    expect(result.lastEatenByDish.get("spoegelse")).toBe("2026-11-01");
  });
});

describe("new vs untried dishes", () => {
  const lastEaten = new Map([["eaten", "2026-11-01"]]);
  it("only a planner-created dish that has not been eaten is new", async () => {
    const { isNewDish, isUntried } = await import("../src/history.ts");
    expect(isNewDish({ id: "g", generated: true }, lastEaten)).toBe(true);
    expect(isNewDish({ id: "eaten", generated: true }, lastEaten)).toBe(false);
    expect(isNewDish({ id: "old" }, lastEaten)).toBe(false);
    expect(isUntried("old", lastEaten)).toBe(true);
    expect(isUntried("eaten", lastEaten)).toBe(false);
  });
});

describe("ratingScores", () => {
  it("adds up thumbs, caps them and lets a latest 'never' rule the dish out", () => {
    const meals: MealMap = {
      "2026-11-01": meal("a", { rating: "up" }),
      "2026-11-02": meal("a", { rating: "up" }),
      "2026-11-03": meal("a", { rating: "up" }),
      "2026-11-04": meal("b", { rating: "down" }),
      "2026-11-05": meal("c", { rating: "never" }),
      "2026-11-06": meal("d", { rating: "never" }),
      "2026-11-07": meal("d", { rating: "up" }),
    };
    const scores = ratingScores(meals);
    expect(scores.get("a")).toBe(25);
    expect(scores.get("b")).toBe(-15);
    expect(scores.get("c")).toBe(-500);
    expect(scores.get("d")).toBe(10);
    expect([...neverAgainDishIds(meals)]).toEqual(["c"]);
  });

  it("keeps 'never' dishes out of the planning context", () => {
    const context = buildPlanningContext({
      dishes: [dish({ id: "c", name: "C" }), dish({ id: "e", name: "E" })],
      dates: ["2026-11-20"],
      meals: { "2026-11-05": meal("c", { rating: "never" }) },
    });
    expect(context.recipes.map((entry) => entry.id)).toEqual(["e"]);
  });
});
