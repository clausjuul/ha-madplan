import { describe, expect, it } from "vitest";
import {
  buildPlanningContext,
  createShoppingList,
  describeVariant,
  maxVariantDays,
  normalizeVariants,
  preferenceScore,
  suggestVariants,
  toDraft,
  validateProposal,
} from "../src/index.ts";
import { dish, meal, profile } from "./fixtures.ts";

const steak = dish({
  id: "boef",
  name: "Bøf med pebersauce",
  category: "Okse",
  ingredients: ["4 bøffer", "1 kg kartofler", "500 g broccoli", "2 dl fløde"],
});
const pasta = dish({ id: "pasta", name: "Pasta med pesto", category: "Pasta", ingredients: ["500 g pasta", "1 glas pesto"] });
const son = profile({ id: "son", name: "Oliver", dislikes: ["bøf"], safeFoods: ["nuggets", "fiskefrikadeller"] });
const mum = profile({ id: "mum", name: "Mor" });
const family = [mum, son];

describe("normalizeVariants", () => {
  it("keeps a swap of a real ingredient for a safe food, named as in the dish", () => {
    expect(normalizeVariants([{ profileId: "son", replaces: "bøf", with: "Nuggets" }], steak, family)).toEqual([
      { profileId: "son", replaces: "bøffer", with: "nuggets" },
    ]);
  });

  it("drops unknown profiles, foods not on the list, parts not in the dish and duplicates", () => {
    const raw = [
      { profileId: "nobody", replaces: "bøf", with: "nuggets" },
      { profileId: "mum", replaces: "bøf", with: "nuggets" },
      { profileId: "son", replaces: "laks", with: "nuggets" },
      { profileId: "son", replaces: "bøf", with: "pizza" },
      { profileId: "son", replaces: "bøf", with: "nuggets" },
      { profileId: "son", replaces: "kartofler", with: "fiskefrikadeller" },
      "junk",
    ];
    expect(normalizeVariants(raw, steak, family)).toEqual([{ profileId: "son", replaces: "bøffer", with: "nuggets" }]);
    expect(normalizeVariants("nope", steak, family)).toEqual([]);
  });

  it("never swaps to something the person or the family must not have", () => {
    const strict = profile({ ...son, exclusions: ["fisk"], safeFoods: ["fiskefrikadeller"] });
    expect(normalizeVariants([{ profileId: "son", replaces: "bøf", with: "fiskefrikadeller" }], steak, [strict])).toEqual([]);
    expect(normalizeVariants([{ profileId: "son", replaces: "bøf", with: "nuggets" }], steak, family, ["nuggets"])).toEqual([]);
  });

  it("ignores inactive profiles", () => {
    const away = profile({ ...son, active: false });
    expect(normalizeVariants([{ profileId: "son", replaces: "bøf", with: "nuggets" }], steak, [away])).toEqual([]);
  });
});

describe("suggestVariants", () => {
  it("swaps a disliked part for the first safe food", () => {
    expect(suggestVariants(steak, family)).toEqual([{ profileId: "son", replaces: "bøffer", with: "nuggets" }]);
    expect(suggestVariants(pasta, family)).toEqual([]);
  });

  it("needs safe foods to suggest anything", () => {
    expect(suggestVariants(steak, [profile({ id: "x", name: "X", dislikes: ["bøf"] })])).toEqual([]);
  });

  it("describes a variant in Danish", () => {
    expect(describeVariant({ profileId: "son", replaces: "bøffer", with: "nuggets" }, family)).toBe(
      "Oliver: nuggets i stedet for bøffer",
    );
  });
});

describe("preferenceScore with safe foods", () => {
  it("penalises a dislike less when the part can be swapped", () => {
    const withoutSafe = profile({ id: "son", name: "Oliver", dislikes: ["bøf"] });
    expect(preferenceScore(steak, [son])).toBeGreaterThan(preferenceScore(steak, [withoutSafe]));
    expect(preferenceScore(steak, [son])).toBeLessThan(0);
  });
});

describe("variants in a plan", () => {
  const dates = ["2026-11-09", "2026-11-10", "2026-11-11"];

  it("keeps valid variants from a proposal and caps how many days get one", () => {
    const steak2 = dish({ ...steak, id: "boef2", name: "Oksebøf med bearnaise" });
    const context = buildPlanningContext({ dishes: [steak, steak2, pasta], dates, meals: {}, profiles: family });
    expect(maxVariantDays(dates.length)).toBe(1);
    const swap = [{ profileId: "son", replaces: "bøf", with: "nuggets" }];
    const validated = validateProposal(
      [
        { date: "2026-11-09", dishId: "boef", reason: "", variants: swap },
        { date: "2026-11-10", dishId: "boef2", reason: "", variants: swap },
      ],
      context,
    );
    expect(validated.plan.map((item) => item.variants?.length ?? 0)).toEqual([1, 0]);
  });

  it("adds a suggested variant when the draft is made, within the cap", () => {
    const context = buildPlanningContext({ dishes: [steak, pasta], dates, meals: {}, profiles: family });
    const draft = toDraft(
      [
        { date: "2026-11-09", dishId: "boef", reason: "", source: "local" },
        { date: "2026-11-10", dishId: "pasta", reason: "", source: "local" },
      ],
      context,
      {},
    );
    expect(draft.days[0]?.variants).toEqual([{ profileId: "son", replaces: "bøffer", with: "nuggets" }]);
    expect(draft.days[1]?.variants).toBeUndefined();
  });
});

describe("shopping with variants", () => {
  const base = {
    listId: "t",
    from: "2026-11-09",
    to: "2026-11-09",
    dishes: [steak],
    fridge: [],
    pantry: [],
    servings: 4,
    profiles: family,
  };

  it("buys one portion less of the swapped part and adds the replacement", () => {
    const plain = createShoppingList({ ...base, meals: { "2026-11-09": meal("boef") } });
    const swapped = createShoppingList({
      ...base,
      meals: { "2026-11-09": meal("boef", { variants: [{ profileId: "son", replaces: "bøffer", with: "nuggets" }] }) },
    });
    const label = (list: typeof plain, name: string) => list.items.find((item) => item.label === name)?.quantityLabel;
    expect(label(plain, "bøffer")).toBe("4 stk.");
    expect(label(swapped, "bøffer")).toBe("3 stk.");
    expect(label(swapped, "kartofler")).toBe(label(plain, "kartofler"));
    expect(swapped.items.find((item) => item.id === "variant:nuggets")).toMatchObject({
      label: "nuggets",
      quantityLabel: "1 portion",
      dishNames: ["Bøf med pebersauce"],
    });
  });
});
