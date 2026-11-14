import { describe, expect, it } from "vitest";
import type { OffersResponse, OffersStatus, ShoppingList } from "@madplan/domain";
import { offerSyncFor, CALL_LIMIT } from "../src/offers/sync.ts";
import { toRetailOffer } from "../src/offers/prej.ts";
import { buildPlanningContext } from "@madplan/domain";
import { planningPrompt } from "../src/ai/plan-ai.ts";
import { fakeAi, setup } from "./helpers.ts";

type Reply = { status?: number; body?: unknown; remaining?: number };

/** Fake Prej: `perChain` offers per chain served 100 per page, or a scripted reply. */
function fakePrej(options: { perChain?: number; reply?: (url: URL) => Reply | undefined } = {}) {
  const calls: URL[] = [];
  let remaining = 25;
  const impl = (async (input: string) => {
    const url = new URL(input);
    calls.push(url);
    remaining -= 1;
    const scripted = options.reply?.(url);
    const headers = { "content-type": "application/json", "x-ratelimit-remaining-day": String(scripted?.remaining ?? remaining) };
    if (scripted) return new Response(JSON.stringify(scripted.body ?? {}), { status: scripted.status ?? 200, headers });
    const chain = url.searchParams.get("chain") ?? "";
    const page = Number(url.searchParams.get("page"));
    const total = options.perChain ?? 150;
    const start = (page - 1) * 100;
    const offers = Array.from({ length: Math.max(0, Math.min(100, total - start)) }, (_, index) => ({
      product_id: start + index + 1,
      name: start + index === 0 ? "Hakket oksekød 8-12 %" : `Vare ${start + index}`,
      chain_slug: chain,
      price: 2995,
      normal_price: 4495,
      quantity_label: "500 g",
      offer_starts: "2026-11-08",
      offer_ends: "2026-11-14",
      multi_buy: null,
    }));
    return new Response(JSON.stringify({ offers, total, page, limit: 100, as_of: "2026-11-09" }), { status: 200, headers });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

async function withStores(fetcher: typeof fetch, stores = ["netto", "rema1000"]) {
  const app = setup({ fetch: fetcher, env: { PREJ_API_KEY: "prej_dev_test" } });
  await app.json("PUT", "settings", { globalExclusions: [], preferredStores: stores });
  return app;
}

describe("Prej offers: fetching within budget", () => {
  it("fetches every page once a day, stores the offers and serves them without new calls", async () => {
    const prej = fakePrej({ perChain: 150 });
    const { deps, json } = await withStores(prej.impl);
    const status = await offerSyncFor(deps).run();
    expect(prej.calls).toHaveLength(4);
    expect(prej.calls[0]?.pathname).toBe("/v1/offers");
    expect(prej.calls[0]?.searchParams.get("limit")).toBe("100");
    expect(status.chains.map((chain) => chain.count)).toEqual([150, 150]);
    expect(status.callsToday).toBe(4);

    await offerSyncFor(deps).run();
    await offerSyncFor(deps).run(true);
    const offers = await json<OffersResponse>("GET", "offers?chain=netto");
    expect(offers.offers).toHaveLength(150);
    expect(offers.offers[0]).toMatchObject({ chain: "netto", amountOre: 2995, normalPriceOre: 4495, source: "Prej" });
    expect(prej.calls).toHaveLength(4);
  });

  it("never makes more than the daily limit, whatever happens", async () => {
    const prej = fakePrej({ perChain: 5000 });
    const { deps, json, call } = await withStores(prej.impl);
    const sync = offerSyncFor(deps);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sync.run(true);
      await call("POST", "offers/refresh");
    }
    expect(prej.calls.length).toBeLessThanOrEqual(CALL_LIMIT);
    const status = await json<OffersStatus>("GET", "offers/status");
    expect(status.callsToday).toBeLessThanOrEqual(CALL_LIMIT);
    // A restart (a new sync on the same database) does not reset the count.
    const restarted = setup({ fetch: prej.impl, repo: deps.repo, env: { PREJ_API_KEY: "prej_dev_test" } });
    await offerSyncFor(restarted.deps).run(true);
    expect(prej.calls.length).toBeLessThanOrEqual(CALL_LIMIT);
  });

  it("stops when Prej says few calls are left, and keeps yesterday's offers on failure", async () => {
    let fail = false;
    const prej = fakePrej({ reply: (url) => (fail && url.searchParams.get("page") === "2" ? { status: 500 } : undefined) });
    const { deps } = await withStores(prej.impl, ["netto"]);
    await offerSyncFor(deps).run();
    expect(offerSyncFor(deps).status().chains[0]?.count).toBe(150);

    deps.now = () => new Date(Date.UTC(2026, 10, 10, 11));
    fail = true;
    const status = await offerSyncFor(deps).run();
    expect(status.chains[0]).toMatchObject({ count: 150, error: expect.stringMatching(/HTTP 500/u) });

    const low = fakePrej({ reply: () => ({ body: { offers: [], total: 0 }, remaining: 2 }) });
    const other = await withStores(low.impl, ["netto", "rema1000"]);
    await offerSyncFor(other.deps).run();
    expect(low.calls).toHaveLength(1);
  });

  it("gives up for the day on a bad key or a used quota", async () => {
    const bad = fakePrej({ reply: () => ({ status: 401, body: { error: "invalid key" } }) });
    const { deps } = await withStores(bad.impl);
    const status = await offerSyncFor(deps).run(true);
    expect(bad.calls).toHaveLength(1);
    expect(status.chains.every((chain) => /afviste nøglen/u.test(chain.error ?? ""))).toBe(true);

    const spent = fakePrej({ reply: () => ({ status: 429, body: { scope: "daily", reset_at: "2026-11-10T00:00:00Z" } }) });
    const other = await withStores(spent.impl);
    await offerSyncFor(other.deps).run(true);
    expect(spent.calls).toHaveLength(1);
  });

  it("waits for the morning unless there are no offers yet, and does nothing without a key or stores", async () => {
    const prej = fakePrej();
    const early = await withStores(prej.impl, ["netto"]);
    early.deps.now = () => new Date(Date.UTC(2026, 10, 9, 2)); // 03:00 in Copenhagen
    await offerSyncFor(early.deps).run();
    expect(prej.calls).toHaveLength(2); // first ever fetch is allowed
    early.deps.now = () => new Date(Date.UTC(2026, 10, 10, 2));
    await offerSyncFor(early.deps).run();
    expect(prej.calls).toHaveLength(2);
    early.deps.now = () => new Date(Date.UTC(2026, 10, 10, 6));
    await offerSyncFor(early.deps).run();
    expect(prej.calls).toHaveLength(4);

    const none = fakePrej();
    const noStores = await withStores(none.impl, []);
    await offerSyncFor(noStores.deps).run(true);
    const noKey = setup({ fetch: none.impl });
    await offerSyncFor(noKey.deps).run(true);
    expect(none.calls).toHaveLength(0);
    expect((await noKey.call("POST", "offers/refresh")).status).toBe(503);
  });
});

describe("Prej offers in the shopping list", () => {
  it("prices a planned ingredient with the matching offer and compares stores", async () => {
    const prej = fakePrej({ perChain: 3 });
    const { deps, json } = await withStores(prej.impl, ["netto"]);
    await json("PUT", "meals/2026-11-10", { dishId: "pasta-bolognese" });
    await offerSyncFor(deps).run();
    const list = await json<ShoppingList>("GET", "shopping");
    const meat = list.items.find((item) => /oksekød/u.test(item.label));
    expect(meat?.offer).toMatchObject({ store: "Netto", price: "29,95 kr." });
    expect(meat?.priceIsOffer).toBe(true);
    expect(list.basket?.stores[0]?.store).toBe("netto");
  });

  it("maps Prej offers strictly", () => {
    const base = { product_id: 1, name: "Smør", chain_slug: "netto", price: 1595, offer_ends: "2026-11-14" };
    expect(toRetailOffer(base, "netto", "2026-11-09")).toMatchObject({ name: "Smør", amountOre: 1595, validFrom: null, multiBuy: null });
    expect(toRetailOffer({ ...base, chain_slug: "lidl" }, "netto", "2026-11-09")).toBeNull();
    expect(toRetailOffer({ ...base, price: 0 }, "netto", "2026-11-09")).toBeNull();
    expect(toRetailOffer({ ...base, name: " " }, "netto", "2026-11-09")).toBeNull();
    expect(toRetailOffer({ ...base, multi_buy: { quantity: 2, price: 3000 }, normal_price: 1000 }, "netto", "2026-11-09")).toMatchObject({
      multiBuy: { quantity: 2, priceOre: 3000 },
      normalPriceOre: null,
    });
  });
});

describe("Prej offers for the assistants", () => {
  it("gives Assist the offers that fit the catalog, and the AI planner onOffer per dish", async () => {
    const prej = fakePrej({ perChain: 3 });
    const ai = fakeAi();
    const app = setup({ fetch: prej.impl, openai: ai, env: { PREJ_API_KEY: "prej_dev_test" } });
    await app.json("PUT", "settings", { globalExclusions: [], preferredStores: ["netto"] });
    await offerSyncFor(app.deps).run();
    ai.next(JSON.stringify({ reply: "Ok.", actions: [] }));
    await app.json("POST", "assist", { messages: [{ role: "user", content: "Hvad er på tilbud?" }], context: { view: "uge" } });
    const input = ai.calls[0]?.input ?? "";
    expect(input).toContain("Tilbud i jeres butikker");
    expect(input).toMatch(/"store":"Netto","item":"Hakket oksekød 8-12 % \(500 g\)","price":"29,95 kr\.","savedKr":15/u);
    expect(ai.calls[0]?.instructions).toContain("bekræftede tilbud");

    const dishes = [{ id: "kodsovs", name: "Kødsovs", ingredients: ["500 g hakket oksekød"], prepMinutes: 30, category: "Pasta", favorite: false, leftoverFriendly: false, freezerFriendly: false }];
    const context = buildPlanningContext({
      dishes, dates: ["2026-11-10"], meals: {}, offers: [{
        name: "Hakket oksekød", chain: "netto", amountOre: 2995, normalPriceOre: 4495, quantityLabel: "500 g", validFrom: null,
        validUntil: "2026-11-14", observed: "2026-11-09", source: "Prej", sourceUrl: "https://prej.dk", confirmed: true, matchMethod: "all-query-tokens",
      }], stores: ["netto"], offersAsOf: "2026-11-09",
    });
    const prompt = planningPrompt(context, { dayCount: 1, from: "2026-11-10", request: "", newDishCount: 0 } as never, "F");
    expect(prompt.input).toContain('"onOffer":[{"ingredient":"hakket oksekød","store":"Netto","price":"29,95 kr.","savedKr":15,"ends":"2026-11-14"}]');
  });
});
