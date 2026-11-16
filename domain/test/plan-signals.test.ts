import { describe, expect, it } from "vitest";
import {
  buildPlanningContext,
  categoryRepeats,
  completePlan,
  createLocalSuggestions,
  describeRepeat,
  neighbourDays,
  reviewPlan,
  swapOutScores,
  validateProposal,
  weekdayRhythm,
} from "../src/index.ts";
import type { EatenEntry, MealMap } from "../src/index.ts";
import { dish, meal } from "./fixtures.ts";

const dishes = [
  dish({ id: "kylling", name: "Kylling i karry", category: "Kylling", prepMinutes: 30 }),
  dish({ id: "kyllingesalat", name: "Kyllingesalat", category: "Kylling", prepMinutes: 20 }),
  dish({ id: "pasta", name: "Pasta med bønner", category: "Pasta", prepMinutes: 20 }),
  dish({ id: "linser", name: "Linsegryde", category: "Vegetar", prepMinutes: 25 }),
  dish({ id: "pizza", name: "Pizza", category: "Pizza", prepMinutes: 50 }),
  dish({ id: "steg", name: "Flæskesteg", category: "Gris", prepMinutes: 120 }),
];

describe("neighbourDays", () => {
  const meals: MealMap = {
    "2026-11-01": meal("pasta"),
    "2026-11-08": meal("kylling"),
    "2026-11-10": meal("linser", { locked: true }),
    "2026-11-11": meal("pizza"),
    "2026-11-12": meal("pasta", { skipped: true }),
    "2026-11-14": meal("steg"),
    "2026-11-15": meal("pizza"),
  };

  it("lists the meals a week before to three days after, without the open and skipped days", () => {
    const days = neighbourDays(meals, dishes, ["2026-11-09", "2026-11-11"], new Set(["2026-11-10"]));
    expect(days).toEqual([
      { date: "2026-11-08", dishId: "kylling", name: "Kylling i karry", category: "Kylling", locked: false },
      { date: "2026-11-10", dishId: "linser", name: "Linsegryde", category: "Vegetar", locked: true },
      { date: "2026-11-14", dishId: "steg", name: "Flæskesteg", category: "Gris", locked: false },
    ]);
  });

  it("is part of the planning context", () => {
    const context = buildPlanningContext({ dishes, dates: ["2026-11-09"], meals });
    expect(context.neighbours.map((day) => day.date)).toEqual(["2026-11-08", "2026-11-10", "2026-11-11"]);
  });
});

describe("categoryRepeats", () => {
  it("finds runs of the same category on consecutive days, but not across gaps or for Andet", () => {
    const repeats = categoryRepeats([
      { date: "2026-11-09", category: "Kylling" },
      { date: "2026-11-10", category: "Kylling" },
      { date: "2026-11-11", category: "Kylling" },
      { date: "2026-11-13", category: "Kylling" },
      { date: "2026-11-14", category: "Andet" },
      { date: "2026-11-15", category: "Andet" },
    ]);
    expect(repeats).toEqual([{ category: "Kylling", dates: ["2026-11-09", "2026-11-10", "2026-11-11"] }]);
    expect(describeRepeat(repeats[0]!)).toMatch(/^Kylling tre dage i træk \(.+, .+ og .+\)$/u);
  });
});

describe("validateProposal", () => {
  it("says why each proposal was refused", () => {
    const context = buildPlanningContext({
      dishes,
      dates: ["2026-11-09", "2026-11-10"],
      meals: {},
      maxPrepMinutes: 40,
    });
    const result = validateProposal(
      [
        { date: "2026-11-09", dishId: "pasta" },
        { date: "2026-11-09", dishId: "linser" },
        { date: "2026-11-10", dishId: "findes-ikke" },
        { date: "2026-11-10", dishId: "pasta" },
        { date: "2026-12-24", dishId: "linser" },
        "noget",
      ],
      context,
    );
    expect(result.rejectedCount).toBe(5);
    expect(result.rejections).toEqual([
      "2026-11-09 fik mere end én ret.",
      "findes-ikke (2026-11-10) findes ikke i catalog.",
      "Pasta med bønner (2026-11-10) er allerede brugt i planen eller på en låst dag.",
      "2026-12-24 er ikke en åben dag i planen.",
      "Forslaget mangler date eller dishId.",
    ]);
  });
});

describe("completePlan", () => {
  it("does not repeat the category of the day before the plan", () => {
    const context = buildPlanningContext({
      dishes: dishes.filter((item) => ["kylling", "kyllingesalat", "linser"].includes(item.id)),
      dates: ["2026-11-09"],
      meals: { "2026-11-08": meal("kylling") },
      // Without the neighbour "Kylling i karry" would win: the scores tie and it sorts first.
    });
    const filled = completePlan(validateProposal([], context), context);
    expect(filled.plan.map((item) => item.dishId)).toEqual(["linser"]);
  });
});

describe("createLocalSuggestions", () => {
  it("avoids the category of a neighbour day", () => {
    const pool = dishes.filter((item) => ["kyllingesalat", "pasta"].includes(item.id));
    const pick = (neighbours: { date: string; category: string }[]) =>
      createLocalSuggestions({
        days: ["2026-11-09"],
        meals: {},
        fridge: [],
        lastEaten: new Map(),
        seed: 1,
        dishes: pool,
        neighbours,
      })[0]?.dishId;
    expect(pick([{ date: "2026-11-10", category: "Kylling" }])).toBe("pasta");
    expect(pick([{ date: "2026-11-10", category: "Pasta" }])).toBe("kyllingesalat");
  });
});

describe("weekdayRhythm", () => {
  // Fridays are mostly pizza, Sundays a slow roast; Tuesdays vary.
  const fridays = ["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30", "2026-11-06"];
  const sundays = ["2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01"];
  const tuesdays = ["2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03"];
  const eaten: EatenEntry[] = [
    ...fridays.map((date, index) => ({ date, dishId: index === 4 ? "pasta" : "pizza" })),
    ...sundays.map((date) => ({ date, dishId: "steg" })),
    ...tuesdays.map((date, index) => ({ date, dishId: index % 2 ? "pasta" : "linser" })),
  ];

  it("finds the weekday patterns with enough history", () => {
    const rhythm = weekdayRhythm(eaten, dishes, "2026-11-09");
    expect(rhythm).toEqual([
      { weekday: 0, oftenCategories: ["Gris"], takesLonger: true },
      { weekday: 5, oftenCategories: ["Pizza"], takesLonger: false },
    ]);
  });

  it("says nothing without enough history", () => {
    expect(weekdayRhythm(eaten.slice(0, 2), dishes, "2026-11-09")).toEqual([]);
    expect(weekdayRhythm(eaten, dishes, "2026-11-09", 1)).toEqual([]);
  });

  it("makes the planner lean towards the usual Friday dish", () => {
    const context = buildPlanningContext({
      dishes: dishes.filter((item) => ["pizza", "linser"].includes(item.id)),
      dates: ["2026-11-13"],
      meals: {},
      today: "2026-11-09",
      eaten,
    });
    expect(context.rhythm.length).toBeGreaterThan(0);
    expect(completePlan(validateProposal([], context), context).plan[0]?.dishId).toBe("pizza");
  });
});

describe("swapOutScores", () => {
  it("gives a soft minus that fades over 60 days and is capped", () => {
    const scores = swapOutScores(
      [
        { dishId: "a", date: "2026-11-09" },
        { dishId: "b", date: "2026-10-10" },
        { dishId: "c", date: "2026-09-01" },
        ...Array.from({ length: 6 }, () => ({ dishId: "d", date: "2026-11-09" })),
      ],
      "2026-11-09",
    );
    expect(scores.get("a")).toBe(-8);
    expect(scores.get("b")).toBe(-4);
    expect(scores.has("c")).toBe(false);
    expect(scores.get("d")).toBe(-24);
  });

  it("is added to the rating scores in the planning context", () => {
    const context = buildPlanningContext({
      dishes,
      dates: ["2026-11-09"],
      meals: { "2026-11-01": meal("pasta", { rating: "up" }) },
      today: "2026-11-09",
      swapOuts: [{ dishId: "pasta", date: "2026-11-09" }],
    });
    expect(context.ratingScores.get("pasta")).toBe(2);
    expect(context.swapOutScores.get("pasta")).toBe(-8);
  });
});

describe("reviewPlan variety", () => {
  it("warns about the same category on consecutive days, neighbours included", () => {
    const meals: MealMap = { "2026-11-08": meal("kylling") };
    const context = buildPlanningContext({ dishes, dates: ["2026-11-09", "2026-11-10"], meals });
    const review = reviewPlan({
      draft: {
        days: [
          { date: "2026-11-09", dishId: "kyllingesalat", reason: "", locked: false, source: "ai" },
          { date: "2026-11-10", dishId: "pasta", reason: "", locked: false, source: "ai" },
        ],
      },
      context,
      dishes,
      meals,
      eaten: [],
    });
    const variety = review.checks.find((check) => check.id === "variety");
    expect(variety).toMatchObject({ status: "warning", dates: ["2026-11-09"] });
    expect(variety?.message).toMatch(/^Kylling to dage i træk/u);
    expect(review.passed).toBe(true);
  });
});
