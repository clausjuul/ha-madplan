import { describe, expect, it } from "vitest";
import { categoryHue, dishInitial, dishSurfaceStyle, hashString } from "../src/lib/dish-surface";
import { dishImageSrc } from "../src/lib/images";

describe("dish colour surface", () => {
  it("hashes deterministically", () => {
    expect(hashString("Pasta")).toBe(hashString("Pasta"));
    expect(hashString("Pasta")).not.toBe(hashString("Suppe"));
  });

  it("derives a stable hue 0-359 per category, ignoring case and whitespace", () => {
    const hue = categoryHue("Pasta");
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
    expect(categoryHue("  pasta ")).toBe(hue);
    expect(categoryHue("Suppe")).not.toBe(hue);
  });

  it("builds the same style for the same category", () => {
    expect(dishSurfaceStyle("Wok")).toEqual(dishSurfaceStyle("Wok"));
    expect(String(dishSurfaceStyle("Wok").background)).toContain(`hsl(${categoryHue("Wok")} `);
  });

  it("uses the upper-cased first letter, also for æøå", () => {
    expect(dishInitial("lasagne")).toBe("L");
    expect(dishInitial("  øllebrød")).toBe("Ø");
    expect(dishInitial("")).toBe("?");
  });
});

describe("dishImageSrc", () => {
  it("resolves a bundled imageKey relative to the base", () => {
    expect(dishImageSrc({ imageKey: "lasagne" })).toBe("images/dishes/lasagne.jpg");
  });
  it("falls back to imageUrl, then nothing", () => {
    expect(dishImageSrc({ imageUrl: "https://x.test/a.jpg" })).toBe("https://x.test/a.jpg");
    expect(dishImageSrc({})).toBeUndefined();
  });
});
