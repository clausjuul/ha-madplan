import { describe, expect, it } from "vitest";
import { buildPlanningContext, completePlan, dishOfferScore, toDraft, validateProposal } from "../src/planning.ts";
import {
  bestOffer,
  dishOfferMatches,
  offerReason,
  offerScore,
  ingredientTokens,
  matchingOffers,
  offerCurrent,
  offerMatches,
  offerPriceLabel,
  offerSavingKr,
  toOfferReference,
  productLabel,
  sameWatch,
  watchedProduct,
  watchlistHits,
  watchMatches,
  watchTokens,
} from "../src/offers.ts";
import type { Dish, GroceryStore, RetailOffer, WatchItem } from "../src/types.ts";

const offer = (name: string, extra: Partial<RetailOffer> = {}): RetailOffer => ({
  name,
  chain: "netto",
  amountOre: 2995,
  quantityLabel: "500 g",
  validFrom: "2026-11-14",
  validUntil: "2026-11-20",
  observed: "2026-11-15",
  source: "Prej",
  sourceUrl: "https://prej.dk",
  confirmed: true,
  matchMethod: "all-query-tokens",
  ...extra,
});

describe("ingredient tokens", () => {
  it("drops amounts, units, brackets and filler words", () => {
    expect(ingredientTokens("400 g hakket oksekød (8-12 %)")).toEqual(["hakket", "oksekød"]);
    expect(ingredientTokens("2 fed hvidløg")).toEqual(["hvidløg"]);
    expect(ingredientTokens("1 dåse hakkede tomater")).toEqual(["hakkede", "tomater"]);
    expect(ingredientTokens("frisk basilikum, til pynt")).toEqual(["basilikum"]);
    expect(ingredientTokens("2 stk løg")).toEqual(["løg"]);
  });
});

describe("matching ingredients to offers", () => {
  const should: [string, string][] = [
    ["400 g hakket oksekød", "Hakket oksekød 8-12 %"],
    ["500 g hakket oksekød", "Dansk hakket oksekød 4-7 %"],
    ["2 løg", "Løg"],
    ["1 kg kartofler", "Kartofler, nye"],
    ["600 g kyllingebryst", "Kyllingebryst"],
    ["kylling", "Kyllingeoverlår"],
    ["2 dl piskefløde", "Piskefløde 38 %"],
    ["1 dåse hakkede tomater", "Hakkede tomater"],
    ["250 g smør", "Smør"],
    ["4 laksefileter", "Laksefileter med skind"],
    ["200 g bacon", "Bacon i skiver"],
    ["1 agurk", "Agurk"],
    ["icebergsalat", "Icebergsalat"],
    ["400 g spaghetti", "Spaghetti"],
    ["revet ost", "Revet ost mozzarella"],
    ["300 g jasminris", "Jasminris"],
    ["2 peberfrugter", "Peberfrugter røde"],
    ["1 broccoli", "Broccoli"],
    ["500 g svinemørbrad", "Svinemørbrad"],
  ];

  const shouldNot: [string, string][] = [
    ["2 løg", "Hvidløg"],
    ["2 fed hvidløg", "Hvidløgsdressing"],
    ["kylling", "Kyllingepålæg"],
    ["kylling", "Kyllingesalat"],
    ["400 g hakket oksekød", "Oksekødsuppe"],
    ["400 g hakket oksekød", "Chili con carne med hakket oksekød"],
    ["kartofler", "Kartoffelchips"],
    ["kartofler", "Chips kartofler"],
    ["tomater", "Tomatsuppe"],
    ["ost", "Ostekiks"],
    ["laks", "Laksesalat"],
    ["bacon", "Bacon chips"],
    ["mælk", "Mælkechokolade"],
    ["æble", "Æblejuice"],
    ["citron", "Citron opvasketabs"],
    ["pasta", "Pastasalat"],
    ["fløde", "Fløde is"],
    ["smør", "Smørepålæg"],
    ["kylling", "Kylling nuggets"],
    ["ris", "Riskiks"],
  ];

  it.each(should)("%s matches %s", (ingredient, name) => {
    expect(offerMatches(ingredient, { name })).toBe(true);
  });

  it.each(shouldNot)("%s does not match %s", (ingredient, name) => {
    expect(offerMatches(ingredient, { name })).toBe(false);
  });

  it("asks for the processed product when the ingredient names it", () => {
    expect(offerMatches("1 glas pesto", { name: "Pesto genovese" })).toBe(true);
    expect(offerMatches("tomatsuppe", { name: "Tomatsuppe" })).toBe(true);
  });
});

describe("choosing an offer", () => {
  const offers = [
    offer("Hakket oksekød 8-12 % dansk", { chain: "rema1000", amountOre: 3495 }),
    offer("Hakket oksekød 8-12 %", { amountOre: 3995 }),
    offer("Hakket oksekød", { amountOre: 4495 }),
    offer("Hakket oksekød gammel", { amountOre: 1000, validUntil: "2026-11-13" }),
    offer("Hakket oksekød fremtid", { amountOre: 1000, validFrom: "2026-11-30" }),
  ];

  it("keeps current offers in the chosen stores, closest name first, then cheapest", () => {
    const found = matchingOffers("400 g hakket oksekød", offers, ["netto"], "2026-11-15");
    // Equally close names ("8-12 %" is not words), so the cheaper one wins.
    expect(found.map((entry) => entry.name)).toEqual(["Hakket oksekød 8-12 %", "Hakket oksekød"]);
    expect(matchingOffers("hakket oksekød", [offer("Hakket oksekød og flæsk", { amountOre: 100 }), offer("Hakket oksekød")], ["netto"], "2026-11-15")[0]?.name).toBe("Hakket oksekød");
    expect(matchingOffers("hakket oksekød", offers, ["netto", "rema1000"], "2026-11-15")).toHaveLength(3);
    expect(matchingOffers("hakket oksekød", offers, [], "2026-11-15")).toEqual([]);
  });

  it("knows when an offer runs", () => {
    expect(offerCurrent({ validFrom: null, validUntil: "2026-11-15" }, "2026-11-15")).toBe(true);
    expect(offerCurrent({ validFrom: "2026-11-16", validUntil: "2026-11-20" }, "2026-11-15")).toBe(false);
    expect(offerCurrent({ validFrom: null, validUntil: "2026-11-14" }, "2026-11-15")).toBe(false);
  });

  it("makes a reference with store, item, price and dates", () => {
    expect(toOfferReference(offer("Smør", { chain: "rema1000", amountOre: 1595, quantityLabel: "250 g" }))).toEqual({
      store: "REMA 1000",
      item: "Smør (250 g)",
      price: "15,95 kr.",
      validFrom: "2026-11-14",
      validUntil: "2026-11-20",
      sourceUrl: "https://prej.dk",
    });
    expect(offerPriceLabel({ amountOre: 1500, multiBuy: { quantity: 2, priceOre: 3000 } })).toBe("2 for 30,00 kr.");
    expect(bestOffer("smør", [offer("Smør")], ["netto"], "2026-11-15")?.store).toBe("Netto");
    expect(bestOffer("smør", [offer("Smør")], ["rema1000"], "2026-11-15")).toBeUndefined();
  });

  it("works out the saving", () => {
    expect(offerSavingKr({ amountOre: 2995, normalPriceOre: 4495 })).toBe(15);
    expect(offerSavingKr({ amountOre: 2995, normalPriceOre: null })).toBe(0);
    expect(offerSavingKr({ amountOre: 2995 })).toBe(0);
  });
});

describe("offers in planning", () => {
  const dish = (id: string, ingredients: string[], category = "Aftensmad"): Dish => ({
    id, name: id, ingredients, prepMinutes: 30, category, favorite: false, leftoverFriendly: false, freezerFriendly: false,
  });
  const dishes = [dish("laks", ["4 laksefileter", "1 kg kartofler"]), dish("kodsovs", ["500 g hakket oksekød", "400 g spaghetti"])];
  const offers = [offer("Hakket oksekød 8-12 %", { amountOre: 2995, normalPriceOre: 4995 })];
  const base = { dishes, dates: ["2026-11-16"], meals: {}, stores: ["netto"] as GroceryStore[], offersAsOf: "2026-11-15" };

  it("finds the dishes with ingredients on offer and scores them softly", () => {
    const context = buildPlanningContext({ ...base, offers });
    expect([...context.dishOffers.keys()]).toEqual(["kodsovs"]);
    expect(dishOfferScore(context, "kodsovs")).toBeGreaterThan(0);
    expect(dishOfferScore(context, "kodsovs")).toBeLessThanOrEqual(24);
    expect(dishOfferScore(context, "laks")).toBe(0);
    expect(buildPlanningContext({ ...base, offers, stores: ["rema1000"] }).dishOffers.size).toBe(0);
  });

  it("tips an otherwise equal choice and says why, with the offer on the draft day", () => {
    const context = buildPlanningContext({ ...base, offers });
    const plan = completePlan(validateProposal([], context), context);
    expect(plan.plan[0]?.dishId).toBe("kodsovs");
    const draft = toDraft(plan.plan, context, {});
    expect(draft.days[0]?.reason).toMatch(/Hakket oksekød er på tilbud i Netto/u);
    expect(draft.days[0]?.offer).toMatchObject({ store: "Netto", price: "29,95 kr." });
  });

  it("never brings back an excluded dish", () => {
    const context = buildPlanningContext({ ...base, offers, globalExclusions: ["oksekød"] });
    expect(context.dishOffers.size).toBe(0);
    expect(completePlan(validateProposal([], context), context).plan[0]?.dishId).toBe("laks");
  });

  it("scores a dish by its ingredients on offer", () => {
    expect(dishOfferMatches(dishes[1]!, offers, ["netto"], "2026-11-15").map((match) => match.ingredient)).toEqual(["hakket oksekød"]);
    expect(offerScore([])).toBe(0);
    expect(offerReason([])).toBe("");
  });
});

describe("watched items (Tilbudsvagt)", () => {
  const stores: GroceryStore[] = ["netto", "rema1000"];
  const offers = [
    offer("Merrild mellemristet kaffe", { amountOre: 4495, brand: "Merrild", productId: 1 }),
    offer("Kaffe filtermalet", { chain: "rema1000", amountOre: 3995, productId: 2 }),
    offer("Kaffefløde 9 %", { amountOre: 1295, productId: 3 }),
    offer("Libero bleer str. 4", { amountOre: 9900, brand: "Libero", productId: 4 }),
    offer("Smør", { brand: "Lurpak", amountOre: 1995, productId: 5 }),
    offer("Smør", { chain: "rema1000", brand: "Lurpak", amountOre: 1895, productId: 5 }),
    offer("Smørbar", { brand: "Lurpak", amountOre: 2195, productId: 6 }),
    offer("Coca-Cola Zero 1,5 l", { amountOre: 1500 }),
    offer("Grillpølser", { amountOre: 2500, productId: 7 }),
    offer("Kaffe gammel", { amountOre: 100, validUntil: "2026-11-13", productId: 8 }),
  ];
  const names = (found: RetailOffer[]) => found.map((entry) => `${entry.chain}:${entry.name}`);
  const find = (item: WatchItem, chains = stores) => names(watchMatches(item, offers, chains, "2026-11-15"));

  it("keeps brand words and drops only tiny filler", () => {
    expect(watchTokens("Lurpak smør")).toEqual(["lurpak", "smør"]);
    expect(watchTokens("Kaffe og te")).toEqual(["kaffe", "te"]);
    expect(watchTokens("  ")).toEqual([]);
  });

  it("finds word starts in name and brand for free text, cheapest first, incl. non-food", () => {
    expect(find({ name: "kaffe" })).toEqual(["netto:Kaffefløde 9 %", "rema1000:Kaffe filtermalet", "netto:Merrild mellemristet kaffe"]);
    expect(find({ name: "Lurpak smør" })).toEqual(["rema1000:Smør", "netto:Smør", "netto:Smørbar"]);
    expect(find({ name: "bleer" })).toEqual(["netto:Libero bleer str. 4"]);
    expect(find({ name: "coca cola" })).toEqual(["netto:Coca-Cola Zero 1,5 l"]);
    expect(find({ name: "øl" })).toEqual([]);
    expect(find({ name: "kaffe" }, ["rema1000"])).toEqual(["rema1000:Kaffe filtermalet"]);
  });

  it("finds an exact product in every store by id, or by name and brand without one", () => {
    const lurpak = offers[4]!;
    expect(productLabel(lurpak)).toBe("Lurpak Smør");
    expect(productLabel(offers[0]!)).toBe("Merrild mellemristet kaffe");
    expect(find({ name: "Lurpak Smør", product: watchedProduct(lurpak) })).toEqual(["rema1000:Smør", "netto:Smør"]);
    expect(find({ name: "Cola", product: { name: "coca-cola zero 1,5 l" } })).toEqual(["netto:Coca-Cola Zero 1,5 l"]);
    expect(find({ name: "Smør", product: { productId: 99, name: "Smør", brand: "Lurpak" } })).toEqual([]);
  });

  it("spots duplicates and lists every watched item, also those not on offer", () => {
    expect(sameWatch({ name: "Kaffe" }, { name: " kaffe" })).toBe(true);
    expect(sameWatch({ name: "Smør", product: { productId: 5, name: "Smør" } }, { name: "Smør" })).toBe(false);
    const hits = watchlistHits([{ name: "Smør", product: { productId: 5, name: "Smør" } }, { name: "Rugbrød" }], offers, stores, "2026-11-15");
    expect(hits.map((hit) => [hit.item.name, hit.offers.length])).toEqual([["Smør", 2], ["Rugbrød", 0]]);
  });
});
