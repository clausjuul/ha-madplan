import { describe, expect, it } from "vitest";
import type { Meal, MealMap } from "@madplan/domain";
import {
  dateStatus,
  formDates,
  gridDates,
  initialForm,
  planTitle,
  toRequest,
  validateDays,
  validateWishes,
} from "../src/lib/plan-form";

const TODAY = "2026-11-09"; // Monday
const meal = (extra: Partial<Meal> = {}): Meal => ({ dishId: "lasagne", locked: false, note: "", source: "manual", ...extra });
const form = (patch: Partial<ReturnType<typeof initialForm>> = {}) => ({ ...initialForm(TODAY, ["Spinat"], true), ...patch });

describe("plan form dates", () => {
  it("covers dayCount days from the start and steps over skipped dates", () => {
    expect(formDates(form({ dayCount: 3 }), TODAY)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(formDates(form({ dayCount: 3, skippedDates: ["2026-11-10"] }), TODAY)).toEqual(["2026-11-09", "2026-11-11", "2026-11-12"]);
  });

  it("never plans before today and the grid always shows the planned days", () => {
    expect(formDates(form({ from: "2026-11-01", dayCount: 1 }), TODAY)).toEqual([TODAY]);
    const grid = gridDates(form({ dayCount: 14, skippedDates: ["2026-11-10", "2026-11-11"] }), TODAY);
    expect(grid.length).toBe(16);
    expect(grid[0]).toBe(TODAY);
  });

  it("titles the plan with the ISO week of its first day", () => {
    expect(planTitle(["2026-11-09"], TODAY)).toBe("Planlæg uge 46");
    expect(planTitle(["2026-11-16"], TODAY)).toBe("Planlæg uge 47");
  });

  it("says what planning does to each date", () => {
    const meals: MealMap = { a: meal(), b: meal({ locked: true }), c: meal({ skipped: true }) };
    expect(dateStatus(meals, "x")).toBe("free");
    expect(dateStatus(meals, "a")).toBe("replaced");
    expect(dateStatus(meals, "b")).toBe("kept");
    expect(dateStatus(meals, "c")).toBe("left-out");
  });
});

describe("step validation", () => {
  it("needs between 1 and 14 days", () => {
    expect(validateDays(form({ dayCount: 0 }), TODAY).ok).toBe(false);
    expect(validateDays(form({ dayCount: 15 }), TODAY).message).toMatch(/1 og 14/u);
    expect(validateDays(form({ dayCount: 7 }), TODAY)).toEqual({ ok: true });
  });

  it("explains when new and chosen dishes do not fit the open days", () => {
    const result = validateWishes(form({ dayCount: 2, newDishCount: 2, requiredDishIds: ["tacos"] }), TODAY, {});
    expect(result.ok).toBe(false);
    expect(result.message).toContain("2 åbne dage");
    expect(result.message).toContain("2 nye retter");
    expect(result.message).toContain("1 valgt ret");
    expect(result.message).toContain("3 i alt");
  });

  it("mentions locked days and explains when every day is locked", () => {
    const meals: MealMap = { "2026-11-09": meal({ locked: true }), "2026-11-10": meal({ locked: true }) };
    const all = validateWishes(form({ dayCount: 2, newDishCount: 0 }), TODAY, meals);
    expect(all.ok).toBe(false);
    expect(all.message).toContain("låst");
    const some = validateWishes(form({ dayCount: 3, newDishCount: 3 }), TODAY, meals);
    expect(some.message).toContain("2 dage er låst");
  });

  it("accepts a feasible request", () => {
    expect(validateWishes(form({ dayCount: 7, newDishCount: 2 }), TODAY, {})).toEqual({ ok: true });
  });
});

describe("request building", () => {
  it("sends the fridge only when it was changed, and drops empty wishes", () => {
    const base = form({ request: "  noget stærkt ", dayRequests: { "2026-11-10": " hurtigt ", "2026-11-11": " ", "2027-01-01": "uden for" }, budget: "600", maxPrepMinutes: 45 });
    const request = toRequest(base, TODAY, ["Spinat"]);
    expect(request).toMatchObject({ engine: "ai", from: TODAY, dayCount: 7, request: "noget stærkt", budgetDkk: 600, maxPrepMinutes: 45 });
    expect(request.dayRequests).toEqual({ "2026-11-10": "hurtigt" });
    expect("fridgeOverride" in request).toBe(false);
    expect(toRequest({ ...base, fridge: ["Spinat", "Fløde"] }, TODAY, ["Spinat"]).fridgeOverride).toEqual(["Spinat", "Fløde"]);
  });

  it("omits unset limits and uses the local engine without AI", () => {
    const request = toRequest(initialForm(TODAY, [], false), TODAY, []);
    expect(request.engine).toBe("local");
    expect("budgetDkk" in request).toBe(false);
    expect("maxPrepMinutes" in request).toBe(false);
  });
});
