import { describe, expect, it } from "vitest";
import type { FridgeItem } from "@madplan/domain";
import { keysForTopics } from "../src/api/queries";
import { canSwap, swapMealsIn } from "../src/lib/meal-ops";
import { parseHash, routeHref } from "../src/lib/route";
import { dayLabels, useFirstItems } from "../src/lib/week-model";

describe("hash routing", () => {
  it("parses the routes and snaps a week to its Monday", () => {
    expect(parseHash("")).toEqual({ name: "uge" });
    expect(parseHash("#/uge")).toEqual({ name: "uge" });
    expect(parseHash("#/uge/2026-11-11")).toEqual({ name: "uge", week: "2026-11-09" });
    expect(parseHash("#/indkob")).toEqual({ name: "indkob" });
    expect(parseHash("#/lav-mad/tacos")).toEqual({ name: "lav-mad", dishId: "tacos" });
  });
  it("round-trips", () => {
    for (const hash of ["#/uge", "#/uge/2026-11-16", "#/retter", "#/planlaeg", "#/indstillinger", "#/lav-mad/tacos"]) {
      expect(routeHref(parseHash(hash))).toBe(hash);
    }
  });
});

describe("meal ops", () => {
  const meals = {
    a: { dishId: "x", locked: false, note: "", source: "manual" as const },
    b: { dishId: "y", locked: true, note: "", source: "manual" as const },
  };
  it("swaps and moves", () => {
    expect(swapMealsIn(meals, "a", "c")).toEqual({ b: meals.b, c: meals.a });
  });
  it("refuses locked swaps with a message", () => {
    const check = canSwap(meals, "a", "b");
    expect(check.ok).toBe(false);
  });
});

describe("week model", () => {
  it("labels days in Danish", () => {
    expect(dayLabels("2026-11-09")).toEqual({ shortLabel: "Man 9.", longLabel: "Mandag 9." });
    expect(dayLabels("2026-11-12").shortLabel).toBe("Tor 12.");
  });
  it("lists fridge items to use first, soonest first", () => {
    const fridge: FridgeItem[] = [
      { name: "Fløde", expiresOn: "2026-11-12" },
      { name: "Spinat", expiresOn: "2026-11-10", useFirst: true },
      { name: "Gulerødder", expiresOn: "2026-11-20" },
      { name: "Ost", useFirst: true },
    ];
    expect(useFirstItems(fridge, "2026-11-09").map((item) => item.label)).toEqual([
      "Spinat · i morgen",
      "Fløde · 3 dage",
      "Ost",
    ]);
  });
});

describe("live updates", () => {
  it("maps topics to query keys", () => {
    expect(keysForTopics(["shopping"])).toEqual([["shopping"]]);
    expect(keysForTopics(["meals"])).toEqual([["bootstrap"], ["shopping"]]);
    expect(keysForTopics(["drafts"])).toEqual([["plan-draft"]]);
  });
});
