import { describe, expect, it } from "vitest";
import type { Profile } from "@madplan/domain";
import { profileSummary } from "../src/components/settings/FamilySection";

const person = (extra: Partial<Profile> = {}): Profile => ({
  id: "p", name: "Mor", active: true, exclusions: [], preferences: [], dislikes: [], favoriteDishIds: [], ...extra,
});

describe("folded person card", () => {
  it("sums up who eats with and what they avoid", () => {
    expect(profileSummary(person())).toBe("Spiser med");
    expect(profileSummary(person({ active: false, portions: 0.5, exclusions: ["peanuts"], dislikes: ["svampe", "oliven"] }))).toBe(
      "Spiser ikke med · 0,5 portioner · Må ikke: peanuts · Kan ikke lide: svampe, oliven",
    );
    expect(profileSummary(person({ portions: 1 }))).toBe("Spiser med");
  });
});
