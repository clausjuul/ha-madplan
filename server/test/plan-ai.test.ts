import { buildPlanningContext } from "@madplan/domain";
import type { Dish } from "@madplan/domain";
import { describe, expect, it } from "vitest";
import { planSchema, planningPrompt } from "../src/ai/plan-ai.ts";

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
});
