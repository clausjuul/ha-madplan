/**
 * Fetches offers from Prej at most once a day per chain and keeps the total far below the key's quota.
 *
 * The hard rule (docs/plans/tilbud.md): never more than CALL_LIMIT calls per UTC day (Prej counts its
 * quota per UTC day). Every call is counted in the database BEFORE it is sent, so restarts, the hourly
 * timer and the "Hent tilbud nu" button can never add up to more. Everything else reads stored offers.
 */
import type { GroceryStore, OffersStatus, RetailOffer } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { HttpError } from "../errors.ts";
import { todayKey } from "../state.ts";
import { getSettings } from "../store-household.ts";
import { clockIn } from "../timezone.ts";
import { fetchOffersPage, PAGE_SIZE, PrejError } from "./prej.ts";
import { callsOn, chainStatus, CHAINS, countCall, markFailed, markSynced, noteRemaining, replaceOffers } from "./store.ts";

/** Madplan's own daily ceiling; the free key allows 25, the rest is left for anything else using the key. */
export const CALL_LIMIT = 20;
/** Stop when Prej says this few are left (another app may share the key). */
export const MIN_REMAINING = 3;
/** Pages per chain per fetch (100 offers each). */
export const MAX_PAGES = 8;
/** Automatic fetches start at this local hour, after Prej's nightly update. */
export const SYNC_HOUR = 6;
const TICK_MS = 60 * 60 * 1000;

export type OfferSync = {
  status(): OffersStatus;
  /** One pass over the chosen chains. `manual` (the button) ignores the hour but never the budget. */
  run(manual?: boolean): Promise<OffersStatus>;
  start(): void;
  stop(): void;
};

const utcDay = (deps: Deps): string => deps.now().toISOString().slice(0, 10);

const chosenChains = (deps: Deps): GroceryStore[] =>
  CHAINS.filter((chain) => getSettings(deps.repo.db).preferredStores.includes(chain));

export function offersStatus(deps: Deps, syncing = false): OffersStatus {
  const { calls, remaining } = callsOn(deps.repo.db, utcDay(deps));
  return {
    configured: deps.config.prejKey.length > 0,
    chains: chosenChains(deps).map((chain) => {
      const { syncedOn: _on, errorOn: _errorOn, ...status } = chainStatus(deps.repo.db, chain);
      return status;
    }),
    callsToday: calls,
    callLimit: CALL_LIMIT,
    remaining,
    syncing,
  };
}

class BudgetSpent extends Error {}

const instances = new WeakMap<Deps, OfferSync>();

/** The one sync per app (routes and the startup timer share it). */
export function offerSyncFor(deps: Deps): OfferSync {
  let sync = instances.get(deps);
  if (!sync) {
    sync = createOfferSync(deps);
    instances.set(deps, sync);
  }
  return sync;
}

export function createOfferSync(deps: Deps): OfferSync {
  const db = deps.repo.db;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<OffersStatus> | undefined;
  /** Chains that hit an error which will not go away today (bad key, Prej's quota used). */
  let blocked: { day: string; reason: string } | undefined;

  /** Counts and sends one call, or throws BudgetSpent without sending. */
  async function call(chain: GroceryStore, page: number, today: string) {
    const day = utcDay(deps);
    const { calls, remaining } = callsOn(db, day);
    if (calls >= CALL_LIMIT) throw new BudgetSpent(`Madplans grænse på ${CALL_LIMIT} kald i døgnet er nået. Der hentes igen i morgen.`);
    if (remaining !== null && remaining <= MIN_REMAINING) throw new BudgetSpent("Der er næsten ingen kald tilbage på Prej-nøglen i dag. Der hentes igen i morgen.");
    countCall(db, day);
    const result = await fetchOffersPage(deps.config.prejKey, deps.fetch, chain, page, today);
    if (result.remaining !== null) noteRemaining(db, day, result.remaining);
    return result;
  }

  /** All pages for one chain; stores them only when complete, so a failure keeps yesterday's offers. */
  async function syncChain(chain: GroceryStore, today: string): Promise<void> {
    const offers: RetailOffer[] = [];
    let asOf: string | null = null;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await call(chain, page, today);
      offers.push(...result.offers);
      asOf ??= result.asOf;
      if (page * PAGE_SIZE >= result.total || result.offers.length === 0) break;
      if (page === MAX_PAGES) console.warn(`Prej: ${chain} har over ${MAX_PAGES * PAGE_SIZE} tilbud; resten springes over.`);
    }
    deps.repo.mutate(["offers", "shopping"], () => {
      replaceOffers(db, chain, offers);
      markSynced(db, chain, { on: today, at: deps.now().toISOString(), asOf: asOf ?? today, count: offers.length });
    });
    console.log(`Tilbud hentet fra Prej: ${chain} ${offers.length} stk. (${callsOn(db, utcDay(deps)).calls}/${CALL_LIMIT} kald i dag)`);
  }

  async function pass(manual: boolean): Promise<OffersStatus> {
    if (!deps.config.prejKey) return offersStatus(deps);
    const today = todayKey(deps);
    const day = utcDay(deps);
    if (blocked && blocked.day !== day) blocked = undefined;
    const hour = clockIn(deps.now(), deps.config.timeZone).hour;
    for (const chain of chosenChains(deps)) {
      const status = chainStatus(db, chain);
      if (status.syncedOn === today) continue;
      // Before the morning fetch, only a chain with no offers at all is fetched (first start).
      if (!manual && hour < SYNC_HOUR && status.syncedAt !== null) continue;
      if (blocked) {
        markFailed(db, chain, blocked.reason, today);
        continue;
      }
      try {
        await syncChain(chain, today);
      } catch (error) {
        const message = error instanceof BudgetSpent || error instanceof PrejError ? error.message : "Tilbuddene kunne ikke hentes.";
        if (!(error instanceof BudgetSpent || error instanceof PrejError)) console.error("Prej-synkronisering fejlede", error);
        else console.warn(`Prej: ${chain}: ${message}`);
        markFailed(db, chain, message, today);
        deps.repo.mutate(["offers"], () => undefined);
        if (error instanceof BudgetSpent || (error instanceof PrejError && (error.kind === "auth" || error.kind === "daily"))) {
          blocked = { day, reason: message };
        } else if (error instanceof PrejError && error.kind === "burst") {
          break; // The next hourly tick tries again.
        }
      }
    }
    return offersStatus(deps);
  }

  function run(manual = false): Promise<OffersStatus> {
    running ??= pass(manual).finally(() => {
      running = undefined;
    });
    return running;
  }

  return {
    status: () => offersStatus(deps, running !== undefined),
    run,
    start() {
      if (!deps.config.prejKey || timer) return;
      const tick = (): void => void run().catch((error: unknown) => console.error("Prej-synkronisering fejlede", error));
      setTimeout(tick, 10_000).unref();
      timer = setInterval(tick, TICK_MS);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}

/** The button: refused when today's offers are in already, or the budget is spent. */
export async function manualRefresh(deps: Deps, sync: OfferSync): Promise<OffersStatus> {
  if (!deps.config.prejKey) throw new HttpError(503, "unavailable", "Tilføj en Prej API-nøgle i appens konfiguration for at hente tilbud.");
  const today = todayKey(deps);
  const chains = chosenChains(deps);
  if (chains.length === 0) throw new HttpError(409, "no_stores", "Vælg mindst én butik først.");
  if (chains.every((chain) => chainStatus(deps.repo.db, chain).syncedOn === today)) {
    throw new HttpError(409, "fresh", "Dagens tilbud er allerede hentet. Prej opdaterer kun én gang i døgnet.");
  }
  if (callsOn(deps.repo.db, utcDay(deps)).calls >= CALL_LIMIT) {
    throw new HttpError(429, "budget", `Madplans grænse på ${CALL_LIMIT} kald i døgnet er nået. Der hentes igen i morgen.`);
  }
  return sync.run(true);
}
