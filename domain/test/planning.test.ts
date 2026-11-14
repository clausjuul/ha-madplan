import { describe, expect, it } from "vitest";
import {
  buildPlanningContext,
  canIncludeDish,
  checkFeasibility,
  completePlan,
  normalizePlanningOptions,
  planningDays,
  preservedDaysFromRequest,
  relativeRecipeCost,
  toDraft,
  validateProposal,
} from "../src/index.ts";
import type { MealMap } from "../src/index.ts";
import { dish, meal, profile } from "./fixtures.ts";

const dates = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"];
const dishes = [
  dish({ id: "lasagne", name: "Lasagne", category: "Pasta", prepMinutes: 55, ingredients: ["500 g oksekød"] }),
  dish({ id: "pasta", name: "Pasta med bønner", category: "Pasta", prepMinutes: 20, ingredients: ["300 g pasta", "400 g bønner"] }),
  dish({ id: "linser", name: "Linsegryde", category: "Vegetar", prepMinutes: 25, ingredients: ["500 g linser"] }),
  dish({ id: "kylling", name: "Kylling i karry", category: "Kylling", prepMinutes: 40, ingredients: ["500 g kylling"] }),
];
const ids = (items: { dishId: string }[]) => items.map((item) => item.dishId);

describe("planningDays", () => {
  const base = { start: "2026-11-09", dayCount: 5, today: "2026-11-09" };

  it("covers N consecutive days from the start date", () => {
    expect(planningDays(base)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  });

  it("never plans before today", () => {
    expect(planningDays({ ...base, start: "2026-11-02", today: "2026-11-11", dayCount: 2 })).toEqual([
      "2026-11-11",
      "2026-11-12",
    ]);
  });

  it("steps over skipped dates without counting them", () => {
    expect(planningDays({ ...base, dayCount: 3, skippedDates: ["2026-11-10"] })).toEqual([
      "2026-11-09",
      "2026-11-11",
      "2026-11-12",
    ]);
  });

  it("handles zero days and is bounded by the horizon", () => {
    expect(planningDays({ ...base, dayCount: 0 })).toEqual([]);
    expect(planningDays({ ...base, dayCount: 10, horizonDays: 3 })).toHaveLength(3);
  });
});

describe("feasibility", () => {
  const week = ["2026-11-09", "2026-11-10", "2026-11-11"];
  const meals: MealMap = { "2026-11-09": meal("lasagne", { locked: true }) };

  it("accepts a plan whose new and required dishes fit the unlocked days", () => {
    const result = checkFeasibility({ dates: week, meals, requiredDishIds: ["pasta"], newDishCount: 1 });
    expect(result).toMatchObject({ ok: true, unlockedDayCount: 2, requiredUnlockedCount: 1 });
  });

  it("does not count required dishes that are already locked", () => {
    expect(checkFeasibility({ dates: week, meals, requiredDishIds: ["lasagne", "pasta", "linser"], newDishCount: 0 }).ok).toBe(true);
  });

  it("rejects too many new dishes with the Danish hint", () => {
    const result = checkFeasibility({ dates: week, meals, requiredDishIds: [], newDishCount: 3 });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Justér antallet af nye eller valgte retter, før planen laves.");
  });

  it("rejects new + required beyond the unlocked days", () => {
    expect(checkFeasibility({ dates: week, meals, requiredDishIds: ["pasta", "linser"], newDishCount: 1 }).ok).toBe(false);
  });

  it("rejects an empty plan", () => {
    const result = checkFeasibility({ dates: [], meals: {}, requiredDishIds: [], newDishCount: 0 });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/maddag/u);
  });

  it("limits which dishes can still be included", () => {
    const input = { dates: week, meals, requiredDishIds: ["pasta"], newDishCount: 1 };
    expect(canIncludeDish("linser", input)).toBe(false);
    expect(canIncludeDish("pasta", input)).toBe(true);
    expect(canIncludeDish("lasagne", input)).toBe(true);
    expect(canIncludeDish("linser", { ...input, newDishCount: 0 })).toBe(true);
  });
});

describe("planning rules", () => {
  it("a Danish instruction protects Tuesday while the rest may change", () => {
    const existing = [{ date: dates[1] ?? "", locked: false }];
    const request = "Behold lasagnen om tirsdagen, men gør resten billigere";
    expect(preservedDaysFromRequest(request, dates, existing)).toEqual([dates[1]]);
    const context = buildPlanningContext({ dishes, dates, meals: { [dates[1] ?? ""]: meal("lasagne") }, request });
    expect(context.lockedDays.get(dates[1] ?? "")).toBe("lasagne");
    expect(context.dates).not.toContain(dates[1]);
    const plan = completePlan(validateProposal([{ date: dates[1], dishId: "linser" }], context), context);
    expect(plan.plan.some((item) => item.date === dates[1])).toBe(false);
    expect(plan.plan.length).toBeGreaterThan(0);
  });

  it("only preserves when asked to, and 'behold låste dage' keeps locked days", () => {
    expect(preservedDaysFromRequest("Lav noget nyt tirsdag", dates, [{ date: dates[1] ?? "", locked: false }])).toEqual([]);
    expect(
      preservedDaysFromRequest("Behold alle låste dage, lav resten om", dates, [
        { date: dates[0] ?? "", locked: true },
        { date: dates[2] ?? "", locked: false },
      ]),
    ).toEqual([dates[0]]);
  });

  it("budget wishes are qualitative and prep limit is a hard constraint", () => {
    expect(normalizePlanningOptions({ budgetDkk: 350, maxPrepMinutes: 30, request: "billigere" }).economical).toBe(true);
    expect(normalizePlanningOptions({ budgetDkk: 10, maxPrepMinutes: 5 })).toMatchObject({ budgetDkk: null, maxPrepMinutes: null });
    const context = buildPlanningContext({ dishes, dates, meals: {}, request: "Gør det billigere", budgetDkk: 350, maxPrepMinutes: 30 });
    expect(context.recipes.map((d) => d.id)).toEqual(["pasta", "linser"]);
    const plan = completePlan(validateProposal([], context), context);
    expect(plan.plan.every((item) => ["pasta", "linser"].includes(item.dishId))).toBe(true);
    expect(plan.missingDates).toHaveLength(2);
    const [lasagne, pasta] = dishes;
    if (!lasagne || !pasta) throw new Error("fixture");
    expect(relativeRecipeCost(pasta)).toBeLessThan(relativeRecipeCost(lasagne));
  });

  it("structured fridge labels still improve recipe ranking", () => {
    const [, pasta] = dishes;
    if (!pasta) throw new Error("fixture");
    expect(relativeRecipeCost(pasta, ["bønner (2 dåser, brug først)"])).toBeLessThan(relativeRecipeCost(pasta, []));
    expect(relativeRecipeCost(pasta, [{ name: "bønner" }])).toBeLessThan(relativeRecipeCost(pasta, []));
  });

  it("day wishes are sanitized and guide deterministic completion", () => {
    const context = buildPlanningContext({
      dishes,
      dates,
      meals: {},
      dayRequests: { [dates[0] ?? ""]: "  linser tak  ", "not-a-date": "ignorer", [dates[1] ?? ""]: "" },
    });
    expect(context.dayRequests).toEqual({ [dates[0] ?? ""]: "linser tak" });
    const plan = completePlan(validateProposal([], context), context);
    expect(plan.plan.find((item) => item.date === dates[0])?.dishId).toBe("linser");
  });
});

describe("planning context and validation", () => {
  const catalog = [
    dish({ id: "pork", name: "Frikadeller", category: "Dansk", ingredients: ["500 g svinekød"] }),
    dish({ id: "fish", name: "Fiskefrikadeller", category: "Fisk", ingredients: ["400 g fisk"] }),
    dish({ id: "pasta", name: "Tomatpasta", category: "Pasta", ingredients: ["400 g pasta", "1 dåse tomat"] }),
    dish({ id: "veg", name: "Grøntsagssuppe", category: "Suppe", ingredients: ["500 g grøntsager"] }),
    dish({ id: "old", name: "Gammel gryde", category: "Gryde", archivedAt: "2026-01-01T00:00:00Z" }),
  ];
  const week = ["2026-10-19", "2026-10-20", "2026-10-21"];

  it("family exclusions, locks, skips and archived dishes take precedence over proposals", () => {
    const context = buildPlanningContext({
      dishes: catalog,
      dates: week,
      meals: { "2026-10-19": meal("fish", { locked: true }), "2026-10-21": meal("veg", { skipped: true }) },
      profiles: [profile({ id: "p", name: "Person", exclusions: ["svinekød"] })],
    });
    expect(context.dates).toEqual(["2026-10-20"]);
    expect(context.skippedDates).toEqual(["2026-10-21"]);
    expect(context.recipes.map((d) => d.id)).toEqual(["fish", "pasta", "veg"]);
    const result = validateProposal(
      [
        { date: "2026-10-19", dishId: "pasta" },
        { date: "2026-10-20", dishId: "pork" },
        { date: "2026-10-20", dishId: "pasta" },
        { date: "2026-10-20", dishId: "veg" },
        { date: "2026-10-21", dishId: "veg" },
        { date: "2026-10-20", dishId: "old" },
        null,
        "tekst",
      ],
      context,
    );
    expect(ids(result.plan)).toEqual(["pasta"]);
    expect(result.rejectedCount).toBe(7);
    expect(result.plan[0]).toMatchObject({ source: "ai", reason: "Valgt ud fra dine præferencer." });
  });

  it("completes AI omissions without repeats and honours required dishes", () => {
    const context = buildPlanningContext({
      dishes: catalog,
      dates: week,
      meals: {},
      globalExclusions: ["svinekød"],
      eatenDishIds: ["fish"],
      requiredDishIds: ["veg"],
      newDishCount: 2,
      fridge: [{ name: "tomat" }],
    });
    const result = completePlan(validateProposal([{ date: "2026-10-19", dishId: "pasta" }], context), context);
    expect(result.plan).toHaveLength(3);
    expect(result.plan.find((item) => item.date === "2026-10-20")?.dishId).toBe("veg");
    expect(new Set(ids(result.plan)).size).toBe(3);
    expect(result.requiredMissing).toEqual([]);
    expect(result.plan.find((item) => item.date === "2026-10-20")?.source).toBe("local");
  });

  it("the fallback balances individual preferences and respects hard restrictions", () => {
    const two = [
      dish({ id: "a", name: "Broccoli og ris", category: "Vegetar", ingredients: ["300 g broccoli", "200 g ris"] }),
      dish({ id: "b", name: "Kylling med pasta", category: "Kylling", ingredients: ["500 g kylling", "400 g pasta"] }),
    ];
    const emma = profile({ id: "e", name: "Emma", preferences: ["kylling"], favoriteDishIds: ["b"], dislikes: ["broccoli"] });
    const leo = profile({ id: "l", name: "Leo", preferences: ["pasta"], dislikes: ["broccoli"] });
    const context = buildPlanningContext({ dishes: two, dates: ["2026-10-20"], meals: {}, profiles: [emma, leo] });
    expect(completePlan(validateProposal([], context), context).plan[0]?.dishId).toBe("b");
    const restricted = buildPlanningContext({
      dishes: two,
      dates: ["2026-10-20"],
      meals: {},
      profiles: [{ ...emma, exclusions: ["kylling"] }, leo],
    });
    expect(restricted.recipes.map((d) => d.id)).toEqual(["a"]);
  });

  it("is deterministic", () => {
    const run = () => {
      const context = buildPlanningContext({ dishes: catalog, dates: week, meals: {} });
      return completePlan(validateProposal([], context), context).plan;
    };
    expect(run()).toEqual(run());
  });

  it("builds drafts that include locked days", () => {
    const meals: MealMap = { "2026-10-19": meal("fish", { locked: true, reason: "Fast tirsdagsret" }) };
    const context = buildPlanningContext({ dishes: catalog, dates: week, meals });
    const draft = toDraft(completePlan(validateProposal([], context), context).plan, context, meals, "Her er planen");
    expect(draft.message).toBe("Her er planen");
    expect(draft.days.map((d) => d.date)).toEqual(week);
    expect(draft.days[0]).toMatchObject({ dishId: "fish", locked: true, reason: "Fast tirsdagsret" });
    expect(draft.days[1]?.locked).toBe(false);
  });
});

describe("relaxed days (god tid)", () => {
  const base = { dishes, dates, meals: {}, maxPrepMinutes: 30 };

  it("keeps slow dishes out of ordinary days but allows them on relaxed days", () => {
    const context = buildPlanningContext({ ...base, relaxedDates: ["2026-10-22", "2026-12-01"] });
    expect(context.relaxedDates).toEqual(["2026-10-22"]);
    expect(context.recipes.map((d) => d.id)).toContain("lasagne");
    const validated = validateProposal(
      [
        { date: "2026-10-19", dishId: "lasagne", reason: "" },
        { date: "2026-10-22", dishId: "kylling", reason: "" },
      ],
      context,
    );
    expect(validated.rejectedCount).toBe(1);
    expect(ids(validated.plan)).toEqual(["kylling"]);
  });

  it("only fills ordinary days with dishes within the time limit", () => {
    const context = buildPlanningContext({ ...base, relaxedDates: ["2026-10-22"] });
    const completed = completePlan(validateProposal([], context), context);
    for (const item of completed.plan) {
      const prep = dishes.find((d) => d.id === item.dishId)!.prepMinutes;
      if (item.date !== "2026-10-22") expect(prep).toBeLessThanOrEqual(30);
    }
    // The relaxed day gets one of the slower dishes that ordinary days could not have.
    expect(["lasagne", "kylling"]).toContain(completed.plan.find((item) => item.date === "2026-10-22")?.dishId);
  });

  it("without relaxed days the time limit filters the catalog as before", () => {
    const context = buildPlanningContext(base);
    expect(context.recipes.map((d) => d.id).sort()).toEqual(["linser", "pasta"]);
  });
});
