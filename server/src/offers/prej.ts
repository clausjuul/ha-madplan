/**
 * Prej API client (https://api.prej.app, see docs/plans/tilbud.md). Only GET /v1/offers is used.
 * One request = one call against the key's daily quota; the caller decides whether a call may be made.
 */
import { PREJ_URL } from "@madplan/domain";
import type { GroceryStore, RetailOffer } from "@madplan/domain";

const BASE = "https://api.prej.app";
export const PAGE_SIZE = 100;

export type PrejErrorKind = "auth" | "daily" | "burst" | "http" | "network";

/** Failure with a Danish message that is safe to show. */
export class PrejError extends Error {
  readonly kind: PrejErrorKind;
  readonly resetAt?: string;

  constructor(kind: PrejErrorKind, message: string, resetAt?: string) {
    super(message);
    this.kind = kind;
    if (resetAt) this.resetAt = resetAt;
  }
}

type PrejOffer = {
  product_id?: unknown;
  name?: unknown;
  brand?: unknown;
  chain_slug?: unknown;
  price?: unknown;
  normal_price?: unknown;
  quantity_label?: unknown;
  offer_starts?: unknown;
  offer_ends?: unknown;
  multi_buy?: { quantity?: unknown; price?: unknown } | null;
};

export type OffersPage = {
  offers: RetailOffer[];
  /** Offers on all pages together. */
  total: number;
  asOf: string | null;
  /** X-RateLimit-Remaining-Day, when sent. */
  remaining: number | null;
};

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);
const int = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) ? value : null);

/** Maps one Prej offer; anything unusable (no name, price or end date, another chain) is dropped. */
export function toRetailOffer(raw: PrejOffer, chain: GroceryStore, observed: string): RetailOffer | null {
  const productId = int(raw.product_id);
  const price = int(raw.price);
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 200) : "";
  if (productId === null || price === null || price <= 0 || !name || raw.chain_slug !== chain || !isDay(raw.offer_ends)) return null;
  const brand = typeof raw.brand === "string" && raw.brand.trim() ? raw.brand.trim().slice(0, 100) : undefined;
  const normal = int(raw.normal_price);
  const multiQuantity = int(raw.multi_buy?.quantity);
  const multiPrice = int(raw.multi_buy?.price);
  return {
    name,
    chain,
    amountOre: price,
    quantityLabel: typeof raw.quantity_label === "string" ? raw.quantity_label.trim().slice(0, 60) : "",
    validFrom: isDay(raw.offer_starts) ? raw.offer_starts : null,
    validUntil: raw.offer_ends,
    observed,
    source: "Prej",
    sourceUrl: PREJ_URL,
    confirmed: true,
    matchMethod: "all-query-tokens",
    productId,
    ...(brand ? { brand } : {}),
    normalPriceOre: normal !== null && normal > price ? normal : null,
    multiBuy: multiQuantity !== null && multiQuantity > 1 && multiPrice !== null && multiPrice > 0 ? { quantity: multiQuantity, priceOre: multiPrice } : null,
  };
}

/** GET /v1/offers for one chain and page. Throws PrejError; never retries by itself. */
export async function fetchOffersPage(
  key: string,
  fetcher: typeof fetch,
  chain: GroceryStore,
  page: number,
  today: string,
): Promise<OffersPage> {
  let response: Response;
  try {
    response = await fetcher(`${BASE}/v1/offers?chain=${chain}&exclude_border_trade=1&limit=${PAGE_SIZE}&page=${page}`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new PrejError("network", "Kunne ikke kontakte Prej.");
  }
  const remainingHeader = response.headers.get("x-ratelimit-remaining-day");
  const remaining = remainingHeader !== null && /^\d+$/u.test(remainingHeader) ? Number(remainingHeader) : null;
  const body = (await response.json().catch(() => ({}))) as {
    offers?: unknown;
    total?: unknown;
    as_of?: unknown;
    scope?: unknown;
    reset_at?: unknown;
    error?: unknown;
  };
  if (response.status === 401 || response.status === 403) throw new PrejError("auth", "Prej afviste nøglen. Tjek Prej API-nøglen i appens konfiguration.");
  if (response.status === 429) {
    const resetAt = typeof body.reset_at === "string" ? body.reset_at : undefined;
    if (body.scope === "burst") throw new PrejError("burst", "Prej beder os vente et øjeblik.", resetAt);
    throw new PrejError("daily", "Dagens kald hos Prej er brugt. Der hentes igen efter midnat (UTC).", resetAt);
  }
  if (!response.ok) throw new PrejError("http", `Prej svarede med en fejl (HTTP ${response.status}).`);
  const asOf = isDay(body.as_of) ? body.as_of : null;
  const raw = Array.isArray(body.offers) ? (body.offers as PrejOffer[]) : [];
  const offers = raw.flatMap((entry) => {
    const offer = toRetailOffer(entry, chain, asOf ?? today);
    return offer ? [offer] : [];
  });
  return { offers, total: int(body.total) ?? raw.length, asOf, remaining };
}
