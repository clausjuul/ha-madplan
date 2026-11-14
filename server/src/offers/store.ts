/** Stored offers and the bookkeeping that keeps Prej calls within budget. Reads never call Prej. */
import type { DatabaseSync } from "node:sqlite";
import type { GroceryStore, OfferChainStatus, RetailOffer } from "@madplan/domain";
import { all, numeric, one, optNumeric, optText, run, toJson } from "../repo.ts";

export const CHAINS: readonly GroceryStore[] = ["netto", "rema1000"];

/** Current and future offers (validUntil >= today) for the given chains. */
export function getOffers(db: DatabaseSync, today: string, chains: readonly GroceryStore[] = CHAINS): RetailOffer[] {
  if (chains.length === 0) return [];
  const marks = chains.map(() => "?").join(", ");
  return all(db, `SELECT json FROM retail_offers WHERE valid_until >= ? AND chain IN (${marks}) ORDER BY chain, product_id`, today, ...chains).map(
    (row) => JSON.parse(String(row.json)) as RetailOffer,
  );
}

/** Replaces all offers of one chain (run inside repo.mutate). */
export function replaceOffers(db: DatabaseSync, chain: GroceryStore, offers: readonly RetailOffer[]): void {
  run(db, "DELETE FROM retail_offers WHERE chain = ?", chain);
  for (const offer of offers) {
    run(
      db,
      "INSERT OR REPLACE INTO retail_offers (chain, product_id, json, valid_until) VALUES (?, ?, ?, ?)",
      chain,
      offer.productId ?? 0,
      toJson(offer),
      offer.validUntil,
    );
  }
}

export function chainStatus(db: DatabaseSync, chain: GroceryStore): OfferChainStatus & { syncedOn: string | null; errorOn: string | null } {
  const row = one(db, "SELECT * FROM offer_sync WHERE chain = ?", chain);
  return {
    chain,
    syncedAt: row ? (optText(row, "synced_at") ?? null) : null,
    syncedOn: row ? (optText(row, "synced_on") ?? null) : null,
    asOf: row ? (optText(row, "as_of") ?? null) : null,
    count: row ? numeric(row, "count") : 0,
    error: row ? (optText(row, "error") ?? null) : null,
    errorOn: row ? (optText(row, "error_on") ?? null) : null,
  };
}

export function markSynced(db: DatabaseSync, chain: GroceryStore, input: { on: string; at: string; asOf: string; count: number }): void {
  run(
    db,
    `INSERT INTO offer_sync (chain, synced_on, synced_at, as_of, count, error, error_on) VALUES (?, ?, ?, ?, ?, NULL, NULL)
     ON CONFLICT(chain) DO UPDATE SET synced_on = excluded.synced_on, synced_at = excluded.synced_at, as_of = excluded.as_of,
       count = excluded.count, error = NULL, error_on = NULL`,
    chain, input.on, input.at, input.asOf, input.count,
  );
}

export function markFailed(db: DatabaseSync, chain: GroceryStore, error: string, on: string): void {
  run(
    db,
    `INSERT INTO offer_sync (chain, error, error_on) VALUES (?, ?, ?)
     ON CONFLICT(chain) DO UPDATE SET error = excluded.error, error_on = excluded.error_on`,
    chain, error, on,
  );
}

/** Calls made this UTC day (the day Prej's quota is counted in) and the last remaining count Prej reported. */
export function callsOn(db: DatabaseSync, utcDay: string): { calls: number; remaining: number | null } {
  const row = one(db, "SELECT calls, remaining FROM prej_calls WHERE day = ?", utcDay);
  return { calls: row ? numeric(row, "calls") : 0, remaining: row ? (optNumeric(row, "remaining") ?? null) : null };
}

/** Counts a call BEFORE it is sent, so a crash mid-request can never let the budget be exceeded. */
export function countCall(db: DatabaseSync, utcDay: string): void {
  run(db, "INSERT INTO prej_calls (day, calls) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1", utcDay);
  run(db, "DELETE FROM prej_calls WHERE day < date(?, '-14 days')", utcDay);
}

export function noteRemaining(db: DatabaseSync, utcDay: string, remaining: number): void {
  run(db, "UPDATE prej_calls SET remaining = ? WHERE day = ?", remaining, utcDay);
}
