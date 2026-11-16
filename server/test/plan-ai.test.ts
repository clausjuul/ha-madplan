import { buildPlanningContext } from "@madplan/domain";
import type { Dish } from "@madplan/domain";
import { describe, expect, it } from "vitest";
import { generateAiPlan, judgeAnswer, planSchema, planningPrompt } from "../src/ai/plan-ai.ts";
import { fakeAi } from "./helpers.ts";

const dish = (id: string, prepMinutes: number): Dish => ({
  id, name: id, ingredients: ["spinat"], prepMinutes, category: "Andet", favorite: false, leftoverFriendly: true, freezerFriendly: false,
});

const context = buildPlanningContext({
  dishes: [dish("a", 20), dish("b", 60)],
  dates: ["2026-11-09", "2026-11-10"],
  meals: {},
  lastEaten: new Map([["a", "2026-10-30"]]),
  fridge: [{ name: "spinat", expiresOn: "2026-11-10", useFirst: true }],
});

describe("AI planning prompt", () => {
  it("gives the model prep time, recency, weekdays and fridge expiry", () => {
    const { input } = planningPrompt(context, { dayCount: 2, from: "2026-11-09", request: "", newDishCount: 0 } as never, "F");
    expect(input).toContain('"prepMinutes":20');
    expect(input).toContain('"daysSinceEaten":10');
    expect(input).toContain('"daysSinceEaten":null');
    expect(input).toContain('"weekday":"mandag"');
    expect(input).toContain('"expiresOn":"2026-11-10","useFirst":true');
  });

  it("limits dates and dish ids in the structured-output schema", () => {
    const item = (planSchema(context).schema as any).properties.plan.items.properties;
    expect(item.date.enum).toEqual(["2026-11-09", "2026-11-10"]);
    expect(item.dishId.enum).toEqual(["a", "b"]);
  });

  it("tells the model about relaxed days and who can get a part of the dish swapped", () => {
    const relaxed = buildPlanningContext({
      dishes: [dish("a", 20), dish("b", 60)],
      dates: ["2026-11-09", "2026-11-10"],
      meals: {},
      maxPrepMinutes: 30,
      relaxedDates: ["2026-11-10"],
      profiles: [
        { id: "son", name: "Oliver", active: true, exclusions: [], preferences: [], dislikes: [], safeFoods: ["nuggets"], favoriteDishIds: [] },
      ],
    });
    const { input } = planningPrompt(relaxed, { dayCount: 2, from: "2026-11-09", request: "", newDishCount: 0 } as never, "F");
    expect(input).toContain('"relaxedDates":["2026-11-10"]');
    expect(input).toContain('"alwaysEats":["nuggets"]');
    expect(input).toContain('"maxVariantDays":1');
    const variants = (planSchema(relaxed).schema as any).properties.plan.items.properties.variants;
    expect(variants.items.properties.profileId.enum).toEqual(["son"]);
    expect(relaxed.recipes.map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("AI planning with context and self-correction", () => {
  const dishes: Dish[] = [
    { ...dish("kylling", 30), name: "Kylling i karry", category: "Kylling" },
    { ...dish("kyllingesalat", 20), name: "Kyllingesalat", category: "Kylling" },
    { ...dish("linser", 25), name: "Linsegryde", category: "Vegetar" },
    { ...dish("pizza", 40), name: "Pizza", category: "Pizza" },
  ];
  const fridays = ["2026-10-16", "2026-10-23", "2026-10-30", "2026-11-06"];
  const planning = buildPlanningContext({
    dishes,
    dates: ["2026-11-12", "2026-11-13"],
    meals: { "2026-11-11": { dishId: "kylling", locked: false, note: "", source: "manual" } },
    today: "2026-11-09",
    eaten: fridays.map((date) => ({ date, dishId: "pizza" })),
    swapOuts: [{ dishId: "linser", date: "2026-11-09" }],
  });
  const answer = (plan: { date: string; dishId: string }[]): string =>
    JSON.stringify({ message: "", plan: plan.map((item) => ({ ...item, reason: "", variants: [] })) });
  const req = { dayCount: 2, from: "2026-11-12", request: "", newDishCount: 0 } as never;

  it("sends the neighbour days, the weekday rhythm and recent swap-outs", () => {
    const { input } = planningPrompt(planning, req, "F");
    expect(input).toContain('"neighbourDays":[{"date":"2026-11-11","weekday":"onsdag","name":"Kylling i karry","category":"Kylling","locked":false}]');
    expect(input).toContain('"weekdayRhythm":[{"weekday":"fredag","oftenCategories":["Pizza"],"takesLonger":false}]');
    expect(input).toContain('"id":"linser"');
    expect(input).toContain('"swappedOutRecently":true');
  });

  it("finds refused proposals and repeated categories in an answer", () => {
    const judged = judgeAnswer(answer([{ date: "2026-11-12", dishId: "kyllingesalat" }, { date: "2026-11-13", dishId: "nope" }]), planning);
    expect(judged.problems).toEqual([
      "nope (2026-11-13) findes ikke i catalog.",
      "Disse åbne datoer fik ingen gyldig ret: 2026-11-13.",
      expect.stringMatching(/^Kylling to dage i træk .*: vælg en anden kategori/u),
    ]);
  });

  it("gives the model one chance to correct itself and keeps the better answer", async () => {
    const ai = fakeAi();
    ai.next(answer([{ date: "2026-11-12", dishId: "kyllingesalat" }, { date: "2026-11-13", dishId: "pizza" }]));
    ai.next(answer([{ date: "2026-11-12", dishId: "linser" }, { date: "2026-11-13", dishId: "pizza" }]));
    const result = await generateAiPlan(ai, "m", planning, req);
    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1]?.input).toContain("Kylling to dage i træk");
    expect(result).toMatchObject({ corrected: true, rejectedCount: 0 });
    expect(result.items.map((item) => item.dishId)).toEqual(["linser", "pizza"]);
  });

  it("keeps the first answer when the correction is worse or fails, and asks only once", async () => {
    const ai = fakeAi();
    ai.next(answer([{ date: "2026-11-12", dishId: "kyllingesalat" }, { date: "2026-11-13", dishId: "pizza" }]));
    ai.next("ikke json");
    const result = await generateAiPlan(ai, "m", planning, req);
    expect(ai.calls).toHaveLength(2);
    expect(result.corrected).toBe(false);
    expect(result.items.map((item) => item.dishId)).toEqual(["kyllingesalat", "pizza"]);

    const fine = fakeAi();
    fine.next(answer([{ date: "2026-11-12", dishId: "linser" }, { date: "2026-11-13", dishId: "pizza" }]));
    await generateAiPlan(fine, "m", planning, req);
    expect(fine.calls).toHaveLength(1);
  });
});
