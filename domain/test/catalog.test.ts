import { describe, expect, it } from "vitest";
import { DISHES, DISH_BY_ID, INSPIRATION_CUISINES, INSPIRATION_RECIPES } from "../src/index.ts";

const TRUSTED_DOMAINS = new Set([
  "arla.dk",
  "hot-thai-kitchen.com",
  "justonecookbook.com",
  "maangchi.com",
  "madensverden.dk",
  "mummum.dk",
  "thewoksoflife.com",
  "valdemarsro.dk",
]);

describe("inspiration catalog", () => {
  it("is broad, diverse and internally unique", () => {
    expect(INSPIRATION_RECIPES.length).toBeGreaterThanOrEqual(55);
    expect(new Set(INSPIRATION_RECIPES.map((r) => r.sourceName)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(INSPIRATION_RECIPES.map((r) => r.cuisine))).toEqual(new Set(INSPIRATION_CUISINES));
    expect(new Set(INSPIRATION_RECIPES.map((r) => r.id)).size).toBe(INSPIRATION_RECIPES.length);
    expect(new Set(INSPIRATION_RECIPES.map((r) => r.sourceUrl)).size).toBe(INSPIRATION_RECIPES.length);
  });

  it("uses direct HTTPS links from trusted sources", () => {
    for (const recipe of INSPIRATION_RECIPES) {
      const match = /^https:\/\/([^/]+)(\/.+)$/u.exec(recipe.sourceUrl);
      expect(match, `${recipe.name}: needs an https URL with a path`).not.toBeNull();
      const host = (match?.[1] ?? "").replace(/^www\./u, "");
      expect(TRUSTED_DOMAINS.has(host), `${recipe.name}: ${host}`).toBe(true);
      expect(recipe.prepMinutes, recipe.name).toBeGreaterThanOrEqual(10);
      expect(recipe.prepMinutes, recipe.name).toBeLessThanOrEqual(240);
    }
  });

  it("references bundled photos by key, never by public URL", () => {
    for (const recipe of INSPIRATION_RECIPES) {
      expect(recipe.imageUrl, recipe.name).toBeUndefined();
      if (recipe.imageKey !== undefined) expect(recipe.imageKey).toMatch(/^[a-z0-9-]+$/u);
    }
    expect(INSPIRATION_RECIPES.filter((r) => r.imageKey).length).toBeGreaterThan(20);
    expect(INSPIRATION_RECIPES.find((r) => r.id === "inspiration-gyoza-i-fad")?.imageKey).toBe("gyoza-i-fad");
  });
});

describe("dish catalog", () => {
  it("has unique ids and complete, well-formed dishes", () => {
    expect(DISHES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(DISHES.map((d) => d.id)).size).toBe(DISHES.length);
    for (const d of DISHES) {
      expect(d.name, d.id).not.toBe("");
      expect(d.prepMinutes, d.id).toBeGreaterThan(0);
      expect(d.imageKey, d.id).toBe(d.id);
      expect(d.imageUrl, d.id).toBeUndefined();
      expect(d.archivedAt, d.id).toBeUndefined();
    }
    expect(DISH_BY_ID.get("lasagne")?.name).toBe("Lasagne");
  });

  it("carries cooking steps for the classic dishes", () => {
    expect(DISH_BY_ID.get("lasagne")?.instructions?.length).toBeGreaterThan(3);
  });
});
