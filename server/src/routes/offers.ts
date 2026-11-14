import type { Hono } from "hono";
import type { GroceryStore, OffersResponse } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { CHAINS, getOffers } from "../offers/store.ts";
import { manualRefresh, offerSyncFor } from "../offers/sync.ts";
import { todayKey } from "../state.ts";
import { oneOf } from "../validate-basic.ts";

export function offerRoutes(api: Hono, deps: Deps): void {
  const sync = offerSyncFor(deps);

  /** Stored offers only; this never calls Prej. */
  api.get("/offers", (c) => {
    const chainParam = c.req.query("chain");
    const chains: readonly GroceryStore[] = chainParam ? [oneOf(chainParam, "Kæde", CHAINS)] : CHAINS;
    const today = todayKey(deps);
    const body: OffersResponse = { offers: getOffers(deps.repo.db, today, chains), asOf: today };
    return c.json(body);
  });

  api.get("/offers/status", (c) => c.json(sync.status()));

  api.post("/offers/refresh", async (c) => c.json(await manualRefresh(deps, sync)));
}
