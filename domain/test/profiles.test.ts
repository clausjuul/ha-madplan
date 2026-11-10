import { describe, expect, it } from "vitest";
import {
  dishAllowed,
  dishConflictReasons,
  foodExclusions,
  normalizeProfileTerms,
  parseExclusionTerms,
  participatingProfiles,
  preferenceScore,
  profileServings,
  toggleProfileFavorite,
} from "../src/index.ts";
import { dish, profile } from "./fixtures.ts";

const broccoli = dish({
  id: "a",
  name: "Broccoli og ris",
  category: "Vegetar",
  ingredients: ["300 g broccoli", "200 g ris"],
});
const chicken = dish({
  id: "b",
  name: "Kylling med pasta",
  category: "Kylling",
  ingredients: ["500 g kylling", "400 g pasta"],
});

describe("profiles", () => {
  it("only active profiles count towards portions", () => {
    const users = [
      profile({ id: "legacy", name: "Mia", portions: 1, preferences: ["pasta"] }),
      profile({ id: "inactive", name: "Bo", active: false, portions: 2, exclusions: ["kylling"] }),
    ];
    expect(participatingProfiles(users).map((p) => p.id)).toEqual(["legacy"]);
    expect(profileServings(users)).toBe(1);
    expect(profileServings([])).toBe(4);
    expect(dishAllowed(chicken, [], users)).toBe(true);
  });

  it("keeps personal dislikes and favorites soft", () => {
    const users = [
      profile({ id: "a", name: "Emma", preferences: ["kylling"], favoriteDishIds: ["b"], dislikes: ["broccoli"] }),
      profile({ id: "b", name: "Leo", preferences: ["ris"], dislikes: ["pasta"] }),
    ];
    expect(preferenceScore(chicken, users)).toBeGreaterThan(preferenceScore(broccoli, users));
    expect(dishAllowed(chicken, [], users)).toBe(true);
    const [emma] = users;
    if (!emma) throw new Error("fixture");
    const changed = toggleProfileFavorite(emma, "b");
    expect(changed.favoriteDishIds).toEqual([]);
    expect(toggleProfileFavorite(changed, "a").favoriteDishIds).toEqual(["a"]);
    expect(emma.favoriteDishIds).toEqual(["b"]);
  });

  it("treats half portions as valid and out-of-range as one", () => {
    expect(profileServings([profile({ id: "a", name: "A", portions: 0.5 }), profile({ id: "b", name: "B", portions: 99 })])).toBe(1.5);
  });

  it("normalizes preference tokens: trimmed, deduplicated, bounded", () => {
    expect(normalizeProfileTerms(" pasta, Kylling ; pasta\n  milde   retter ")).toEqual([
      "pasta",
      "Kylling",
      "milde retter",
    ]);
    expect(normalizeProfileTerms(["Ris", "ris", "x", "Broccoli"], 2)).toEqual(["Ris", "Broccoli"]);
  });
});

describe("exclusions", () => {
  it("explains which active profile blocks a dish", () => {
    const users = [
      profile({ id: "a", name: "Emma", exclusions: ["kylling"] }),
      profile({ id: "b", name: "Bo", active: false, exclusions: ["pasta"] }),
    ];
    expect(dishAllowed(chicken, ["tomat"], users)).toBe(false);
    expect(dishConflictReasons(chicken, ["tomat"], users)).toEqual(["Emma: kylling"]);
    expect(dishAllowed(chicken, [], [profile({ id: "a", name: "Emma", active: false, exclusions: ["kylling"] })])).toBe(true);
  });

  it("explains global conflicts as 'Fælles'", () => {
    expect(dishConflictReasons(chicken, ["Pasta"], [])).toEqual(["Fælles: pasta"]);
  });

  it("parses terms: separators, case, minimum length and duplicates", () => {
    expect(parseExclusionTerms("Nødder, rejer;  x\nrejer")).toEqual(["nødder", "rejer"]);
    expect(parseExclusionTerms(["  SVAMPE ", "", "a"])).toEqual(["svampe"]);
  });

  it("an empty or one-letter term can never block every dish", () => {
    expect(dishAllowed(chicken, ["", " ", "k"], [profile({ id: "a", name: "A", exclusions: [""] })])).toBe(true);
  });

  it("combines global and active profile exclusions", () => {
    const users = [profile({ id: "a", name: "A", exclusions: ["nødder"] }), profile({ id: "b", name: "B", active: false, exclusions: ["fisk"] })];
    expect(foodExclusions(["rejer"], users)).toEqual(["rejer", "nødder"]);
  });
});
