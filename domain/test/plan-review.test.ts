import { describe, expect, it } from "vitest";
import {
  buildPlanningContext,
  completePlan,
  eatenHistory,
  reviewPlan,
  toDraft,
  validateProposal,
} from "../src/index.ts";
import type { MealMap, PlanDraft, PlanningContextInput } from "../src/index.ts";
import { dish, meal, profile } from "./fixtures.ts";

const today = "2026-11-09";
const dishes = [
  dish({ id: "lasagne", name: "Lasagne", prepMinutes: 55, ingredients: ["500 g hakket oksekød", "12 lasagneplader"] }),
  dish({ id: "pasta", name: "Tomatpasta", prepMinutes: 20, ingredients: ["400 g pasta"] }),
  dish({ id: "rejer", name: "Rejewok", prepMinutes: 25, ingredients: ["400 g rejer"] }),
  dish({ id: "suppe", name: "Suppe", prepMinutes: 30, ingredients: ["1 l bouillon"] }),
];

function review(draft: PlanDraft, extra: Partial<PlanningContextInput> = {}, meals: MealMap = {}) {
  const dates = draft.days.map((day) => day.date);
  const context = buildPlanningContext({ dishes, dates, meals, ...extra });
  return reviewPlan({ draft, context, dishes, meals, eaten: eatenHistory(meals, today) });
}

const day = (date: string, dishId: string, locked = false): PlanDraft["days"][number] => ({
  date,
  dishId,
  reason: "test",
  locked,
  source: "local",
});

const byId = (result: ReturnType<typeof review>, id: string) => result.checks.find((check) => check.id === id);

describe("reviewPlan", () => {
  it("passes a clean plan, skipping rules that are not set", () => {
    const result = review({ days: [day("2026-11-10", "pasta"), day("2026-11-11", "suppe")] });
    expect(result.passed).toBe(true);
    expect(byId(result, "coverage")?.status).toBe("ok");
    expect(byId(result, "exclusions")?.status).toBe("skipped");
    expect(byId(result, "prepTime")?.status).toBe("skipped");
    expect(byId(result, "budget")?.status).toBe("skipped");
    expect(result.estimatedCostDkk).toBeNull();
  });

  it("flags excluded ingredients as violations with the blocking person", () => {
    const result = review(
      { days: [day("2026-11-10", "rejer"), day("2026-11-11", "pasta")] },
      { profiles: [profile({ id: "e", name: "Emma", exclusions: ["rejer"] })], globalExclusions: ["svampe"] },
    );
    const check = byId(result, "exclusions");
    expect(check).toMatchObject({ status: "violation", dates: ["2026-11-10"] });
    expect(check?.message).toContain("Rejewok (Emma: rejer)");
    expect(result.passed).toBe(false);
    expect(result.familyProfilesApplied).toBe(1);
  });

  it("confirms exclusions when nothing conflicts", () => {
    const result = review({ days: [day("2026-11-10", "pasta")] }, { globalExclusions: ["svampe"] });
    expect(byId(result, "exclusions")?.status).toBe("ok");
  });

  it("warns about repeats within 14 days of eaten meals, but not beyond", () => {
    const meals: MealMap = { "2026-11-05": meal("pasta"), "2026-10-20": meal("lasagne") };
    const result = review({ days: [day("2026-11-10", "pasta"), day("2026-11-11", "lasagne")] }, {}, meals);
    const check = byId(result, "repeats");
    expect(check?.status).toBe("warning");
    expect(check?.dates).toEqual(["2026-11-10"]);
    expect(check?.message).toContain("Tomatpasta");
    expect(result.passed).toBe(true);
  });

  it("counts exactly 14 days as a repeat and 15 as fine", () => {
    const meals: MealMap = { "2026-10-27": meal("pasta"), "2026-10-26": meal("lasagne") };
    const result = review({ days: [day("2026-11-10", "pasta"), day("2026-11-11", "lasagne")] }, {}, meals);
    expect(byId(result, "repeats")?.dates).toEqual(["2026-11-10"]);
  });

  it("warns about repeats inside the plan itself", () => {
    const result = review({ days: [day("2026-11-10", "pasta"), day("2026-11-12", "pasta")] });
    expect(byId(result, "repeats")).toMatchObject({ status: "warning", dates: ["2026-11-12"] });
  });

  it("enforces the prep-time limit; locked dishes only warn", () => {
    const strict = review({ days: [day("2026-11-10", "lasagne"), day("2026-11-11", "pasta")] }, { maxPrepMinutes: 30 });
    expect(byId(strict, "prepTime")).toMatchObject({ status: "violation", dates: ["2026-11-10"] });
    const locked = review({ days: [day("2026-11-10", "lasagne", true)] }, { maxPrepMinutes: 30 });
    expect(byId(locked, "prepTime")?.status).toBe("warning");
    const fine = review({ days: [day("2026-11-11", "pasta")] }, { maxPrepMinutes: 30 });
    expect(byId(fine, "prepTime")?.status).toBe("ok");
  });

  it("does not hold relaxed days to the prep-time limit", () => {
    const result = review({ days: [day("2026-11-10", "lasagne")] }, { maxPrepMinutes: 30, relaxedDates: ["2026-11-10"] });
    expect(byId(result, "prepTime")?.status).toBe("ok");
  });

  it("compares a rough estimate with the budget", () => {
    const cheap = review({ days: [day("2026-11-10", "pasta")] }, { budgetDkk: 500 });
    expect(byId(cheap, "budget")?.status).toBe("ok");
    expect(cheap.estimatedCostDkk).toBe(15);
    const dear = review({ days: [day("2026-11-10", "lasagne")] }, { budgetDkk: 50 });
    expect(byId(dear, "budget")?.status).toBe("warning");
    expect(byId(dear, "budget")?.message).toContain("Ca.");
  });

  it("reports uncovered dates, missing required dishes and unmet new-dish targets", () => {
    const dates = ["2026-11-10", "2026-11-11"];
    const context = buildPlanningContext({
      dishes,
      dates,
      meals: {},
      requiredDishIds: ["suppe"],
      newDishCount: 2,
      eatenDishIds: ["pasta", "lasagne", "rejer"],
    });
    const result = reviewPlan({ draft: { days: [day("2026-11-10", "pasta")] }, context, dishes, meals: {}, eaten: [] });
    expect(result.unresolvedDates).toEqual(["2026-11-11"]);
    expect(byId(result, "coverage")?.status).toBe("violation");
    expect(byId(result, "required")?.status).toBe("warning");
    expect(byId(result, "newDishes")?.status).toBe("warning");
    expect(byId(result, "newDishes")?.message).toBe("0 nye retter, men I bad om 2.");
  });

  it("counts only planner-proposed dishes as new and is ok when the count matches", () => {
    const context = buildPlanningContext({ dishes, dates: ["2026-11-10"], meals: {}, newDishCount: 1 });
    const proposed = dish({ id: "ny2", name: "Ny", ingredients: ["ris"] });
    const withNew = reviewPlan({
      draft: { days: [{ date: "2026-11-10", newDish: proposed, reason: "x", locked: false, source: "ai" }] },
      context, dishes, meals: {}, eaten: [],
    });
    expect(byId(withNew, "newDishes")).toMatchObject({ status: "ok", message: "1 ny ret, som ønsket." });
    const library = reviewPlan({ draft: { days: [day("2026-11-10", "pasta")] }, context, dishes, meals: {}, eaten: [] });
    expect(byId(library, "newDishes")?.status).toBe("warning");
    expect(byId(library, "newDishes")?.message).toBe("0 nye retter, men I bad om 1.");
  });

  it("reviews a freshly generated plan end to end, including a brand-new dish", () => {
    const dates = ["2026-11-10", "2026-11-11"];
    const context = buildPlanningContext({ dishes, dates, meals: {} });
    const generated = toDraft(completePlan(validateProposal([], context), context).plan, context, {});
    const withNew: PlanDraft = {
      days: [
        { date: "2026-11-10", newDish: dish({ id: "ny", name: "Ny ret", ingredients: ["svampe"] }), reason: "Ny", locked: false, source: "ai" },
        ...generated.days.slice(1),
      ],
    };
    const result = reviewPlan({
      draft: withNew,
      context: buildPlanningContext({ dishes, dates, meals: {}, globalExclusions: ["svampe"] }),
      dishes,
      meals: {},
      eaten: [],
    });
    expect(byId(result, "exclusions")?.status).toBe("violation");
    expect(result.unresolvedDates).toEqual([]);
  });
});
