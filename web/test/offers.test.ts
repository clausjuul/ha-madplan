import { describe, expect, it } from "vitest";
import type { OffersStatus, ShoppingList } from "@madplan/domain";
import { offerLines } from "../src/components/settings/StoresSection";
import { cheapestLine } from "../src/components/shopping/PriceSummary";
import { keysForTopics, queryKeys } from "../src/api/queries";

const status = (chains: OffersStatus["chains"]): OffersStatus => ({
  configured: true, chains, callsToday: 4, callLimit: 20, remaining: 21, syncing: false,
});

describe("offers in the UI", () => {
  it("describes each store's fetch, and a failure next to the offers still shown", () => {
    const lines = offerLines(status([
      { chain: "netto", syncedAt: "2026-11-15T05:02:00.000Z", asOf: "2026-11-15", count: 187, error: null },
      { chain: "rema1000", syncedAt: null, asOf: null, count: 0, error: null },
    ]));
    expect(lines[0]).toMatch(/^Netto: 187 tilbud, hentet /u);
    expect(lines[1]).toBe("REMA 1000: ikke hentet endnu");
    const failed = offerLines(status([{ chain: "netto", syncedAt: "2026-11-14T05:00:00.000Z", asOf: null, count: 90, error: "Prej afviste nøglen." }]));
    expect(failed[0]).toMatch(/^Netto: Prej afviste nøglen\. \(viser 90 tilbud/u);
  });

  it("names the cheapest store only when both can be compared", () => {
    const list = { basket: { stores: [], commonCount: 3, commonTotals: [{ store: "rema1000", totalOre: 43800 }, { store: "netto", totalOre: 41200 }], fullComparisonAvailable: false } } as unknown as ShoppingList;
    expect(cheapestLine(list)).toBe("Billigst på 3 tilbudsvarer: Netto 412 kr. · REMA 1000 438 kr.");
    expect(cheapestLine({ ...list, basket: { ...list.basket!, commonCount: 0 } })).toBeNull();
    expect(cheapestLine({} as ShoppingList)).toBeNull();
  });

  it("refreshes the shopping list and the status when offers change", () => {
    expect(keysForTopics(["offers"])).toEqual([queryKeys.offersStatus, queryKeys.shopping]);
  });
});
