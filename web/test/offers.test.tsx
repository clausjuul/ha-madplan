import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { render, screen } from "@testing-library/react";
import type { OffersStatus, RetailOffer, ShoppingList } from "@madplan/domain";
import { PhoneHeader } from "../src/components/shell/PhoneChrome";
import { capGroups, decorateOffers, filterShown, NO_FILTERS, sortAndGroup } from "../src/lib/offers-view";
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
    expect(keysForTopics(["offers"])).toEqual([queryKeys.offersStatus, queryKeys.offers, queryKeys.shopping]);
  });
});

describe("offers list", () => {
  const offer = (name: string, chain: "netto" | "rema1000", amountOre: number, normalPriceOre: number | null, brand?: string): RetailOffer => ({
    name, chain, amountOre, normalPriceOre, quantityLabel: "", validFrom: null, validUntil: "2026-11-20", observed: "2026-11-15",
    source: "Prej", sourceUrl: "https://prej.dk", confirmed: true, matchMethod: "all-query-tokens", ...(brand ? { brand } : {}),
  });
  const offers = [
    offer("Hakket oksekød 8-12 %", "netto", 2995, 4495),
    offer("Kyllingebryst", "rema1000", 4995, 7995),
    offer("Smør", "netto", 1595, null, "Lurpak"),
  ];

  const dishes = [{ id: "kodsovs", name: "Kødsovs", ingredients: ["500 g hakket oksekød"], prepMinutes: 30, category: "Pasta", favorite: false, leftoverFriendly: false, freezerFriendly: false }];
  const shown = decorateOffers(offers, dishes, ["netto", "rema1000"], "2026-11-15");
  const names = (entries: { offer: RetailOffer }[]) => entries.map((entry) => entry.offer.name);

  it("adds category, discount and the dishes an offer fits", () => {
    expect(shown.map((entry) => entry.category)).toEqual(["Kød og fisk", "Kød og fisk", "Køl"]);
    expect(shown[0]).toMatchObject({ discountPct: 33, dishes: ["Kødsovs"] });
    expect(shown[2]?.discountPct).toBeNull();
  });

  it("searches name and brand and filters by store, category, dishes and ending soon", () => {
    expect(names(filterShown(shown, { ...NO_FILTERS, query: "lurpak" }, "2026-11-15"))).toEqual(["Smør"]);
    expect(names(filterShown(shown, { ...NO_FILTERS, query: "HAKKET okse" }, "2026-11-15"))).toEqual(["Hakket oksekød 8-12 %"]);
    expect(filterShown(shown, { ...NO_FILTERS, store: "netto" }, "2026-11-15").map((entry) => entry.offer.chain)).toEqual(["netto", "netto"]);
    expect(names(filterShown(shown, { ...NO_FILTERS, category: "Køl" }, "2026-11-15"))).toEqual(["Smør"]);
    expect(names(filterShown(shown, { ...NO_FILTERS, fitsDishes: true }, "2026-11-15"))).toEqual(["Hakket oksekød 8-12 %"]);
    expect(filterShown(shown, { ...NO_FILTERS, endingSoon: true }, "2026-11-15")).toHaveLength(0);
    expect(filterShown(shown, { ...NO_FILTERS, endingSoon: true }, "2026-11-18")).toHaveLength(3);
  });

  it("sorts by saving, discount, price, name and groups by category or store", () => {
    expect(names(sortAndGroup(shown, "besparelse")[0]!.offers)).toEqual(["Kyllingebryst", "Hakket oksekød 8-12 %", "Smør"]);
    expect(names(sortAndGroup(shown, "rabat")[0]!.offers)).toEqual(["Kyllingebryst", "Hakket oksekød 8-12 %", "Smør"]);
    expect(names(sortAndGroup(shown, "pris")[0]!.offers)).toEqual(["Smør", "Hakket oksekød 8-12 %", "Kyllingebryst"]);
    expect(names(sortAndGroup(shown, "navn")[0]!.offers)).toEqual(["Hakket oksekød 8-12 %", "Kyllingebryst", "Smør"]);
    expect(sortAndGroup(shown, "kategori").map((group) => group.title)).toEqual(["Kød og fisk", "Køl"]);
    expect(sortAndGroup(shown, "butik").map((group) => [group.title, group.offers.length])).toEqual([["Netto", 2], ["REMA 1000", 1]]);
    expect(capGroups(sortAndGroup(shown, "kategori"), 2).flatMap((group) => group.offers)).toHaveLength(2);
  });

  it("puts Indstillinger in the phone header", () => {
    render(<PhoneHeader weekStart="2026-11-09" onWeekChange={() => undefined} />, { wrapper: MemoryRouter });
    expect(screen.getByRole("link", { name: "Indstillinger" }).getAttribute("href")).toBe("/indstillinger");
  });
});
