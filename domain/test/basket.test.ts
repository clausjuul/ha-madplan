import { describe, expect, it } from "vitest";
import { compareBaskets } from "../src/index.ts";
import type { GroceryStore, RetailOffer } from "../src/index.ts";

const item = (id: string, label: string, quantityLabel: string) => ({
  id,
  label,
  quantityLabel,
  extra: false,
});

const offer = (
  chain: GroceryStore,
  amountOre: number,
  quantityLabel: string,
  name: string,
): RetailOffer => ({
  chain,
  amountOre,
  quantityLabel,
  name,
  validFrom: "2026-10-18",
  validUntil: "2026-10-25",
  observed: "2026-10-20",
  source: "Prej",
  sourceUrl: "https://prej.dk/",
  confirmed: true,
  matchMethod: "all-query-tokens",
});

const result = (offers: { ingredient: string; matches: RetailOffer[] }[], asOf = "2026-10-20") => ({
  asOf,
  offers,
  exhausted: false,
  remainingRequests: 10,
  configured: true,
});

describe("compareBaskets", () => {
  it("rounds packs up and compares only common covered products", () => {
    const items = [
      item("meat", "hakket oksekød", "750 g"),
      item("pasta", "pasta", "400 g"),
      item("unknown", "salt", "Mængde ikke angivet"),
    ];
    const comparison = compareBaskets(
      items,
      result([
        { ingredient: "hakket oksekød", matches: [offer("netto", 3000, "500 g", "Hakket oksekød"), offer("rema1000", 4000, "1 kg", "Hakket oksekød")] },
        { ingredient: "pasta", matches: [offer("netto", 1500, "500 g", "Pasta")] },
      ]),
      ["netto", "rema1000"],
    );
    expect(comparison.stores[0]).toMatchObject({ knownOre: 7500, coveredCount: 2 });
    expect(comparison.stores[1]).toMatchObject({ knownOre: 4000, coveredCount: 1 });
    expect(comparison.commonCount).toBe(1);
    expect(comparison.commonTotals.map((entry) => entry.totalOre)).toEqual([6000, 4000]);
    expect(comparison.fullComparisonAvailable).toBe(false);
  });

  it("never fakes a price from mismatched pack units", () => {
    const comparison = compareBaskets(
      [item("one", "ris", "500 g")],
      result([{ ingredient: "ris", matches: [offer("netto", 2000, "1 liter", "Ris")] }]),
      ["netto"],
    );
    expect(comparison.stores[0]).toMatchObject({ knownOre: 0, missingCount: 1 });
  });

  it("handles multi-packs, cans and liquids", () => {
    const comparison = compareBaskets(
      [item("chicken", "kylling", "900 g"), item("tomato", "hakkede tomater", "3 dåser"), item("milk", "mælk", "1,5 liter")],
      result([
        { ingredient: "kylling", matches: [offer("netto", 5995, "2 x 500 g", "Kylling")] },
        { ingredient: "hakkede tomater", matches: [offer("netto", 795, "1 dåse", "Hakkede tomater")] },
        { ingredient: "mælk", matches: [offer("netto", 1495, "1 l", "Mælk")] },
      ]),
      ["netto"],
    );
    expect(comparison.stores[0]?.knownOre).toBe(5995 + 3 * 795 + 2 * 1495);
    expect(comparison.stores[0]?.coveredCount).toBe(3);
  });

  it("ignores unconfirmed, future and expired offers", () => {
    const current = offer("netto", 2000, "1 kg", "Ris");
    const candidates: RetailOffer[] = [
      { ...current, confirmed: false as unknown as true },
      { ...current, validUntil: "2026-10-19" },
      { ...current, validFrom: "2026-10-21" },
    ];
    for (const candidate of candidates) {
      const comparison = compareBaskets(
        [item("rice", "ris", "1 kg")],
        result([{ ingredient: "ris", matches: [candidate] }]),
        ["netto"],
      );
      expect(comparison.stores[0]).toMatchObject({ knownOre: 0, coveredCount: 0 });
    }
  });

  it("reports a full comparison when both stores cover everything", () => {
    const comparison = compareBaskets(
      [item("rice", "ris", "1 kg")],
      result([{ ingredient: "ris", matches: [offer("netto", 2000, "1 kg", "Ris"), offer("rema1000", 1800, "1 kg", "Ris")] }]),
      ["netto", "rema1000"],
    );
    expect(comparison.fullComparisonAvailable).toBe(true);
    expect(comparison.commonTotals).toEqual([
      { store: "netto", totalOre: 2000 },
      { store: "rema1000", totalOre: 1800 },
    ]);
    expect(comparison.stores[0]?.lines[0]).toMatchObject({ name: "ris", packages: 1, product: "Ris" });
  });

  it("excludes extras from the comparison", () => {
    const comparison = compareBaskets(
      [{ ...item("x", "ris", "1 kg"), extra: true }],
      result([{ ingredient: "ris", matches: [offer("netto", 2000, "1 kg", "Ris")] }]),
      ["netto"],
    );
    expect(comparison.stores[0]?.coveredCount).toBe(0);
  });
});
