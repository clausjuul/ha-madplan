/**
 * Retail offers (from Prej, stored by the server once a day) matched against ingredient names.
 *
 * Matching is deliberately strict: every meaningful word of the ingredient must start a word in the
 * offer's name, and offers for processed products ("oksekødsuppe", "kyllingepålæg") or non-food never
 * match a raw ingredient unless the ingredient asks for that product. A missed offer costs a little
 * money; a wrong one ("løg" -> "hvidløgsdressing") costs trust.
 */
import { normalizeItem, parseIngredient } from "./ingredients.ts";
import type { Dish, GroceryStore, OfferReference, RetailOffer, RetailOfferResult, WatchedProduct, WatchItem } from "./types.ts";

export const STORE_NAMES: Record<GroceryStore, OfferReference["store"]> = {
  netto: "Netto",
  rema1000: "REMA 1000",
};

export const PREJ_URL = "https://prej.dk";

/** Words that describe an ingredient but are not needed in the product name. */
const FILLER = new Set([
  "frisk", "friske", "fersk", "ferske", "evt", "eventuelt", "til", "og", "eller", "af", "med", "i", "på",
  "lidt", "god", "gode", "store", "stor", "små", "lille", "mellem", "grov", "groft", "fint", "fin",
  "finthakket", "finthakkede", "skåret", "skårne", "skiver", "tern", "terninger", "revet", "revne",
  "kogt", "kogte", "stykker", "stk", "ca", "gerne", "efter", "smag", "økologisk", "økologiske", "øko",
  "dansk", "danske", "pakke", "pakker", "dåse", "dåser", "bundt", "bundter", "fed", "glas", "flaske",
]);

/** Product words that make an offer something else than a raw ingredient, unless the ingredient says so. */
const PROCESSED = [
  "suppe", "chips", "snack", "snacks", "sauce", "dressing", "dip", "pålæg", "salat", "kiks", "kage", "kager",
  "slik", "is", "pizza", "lasagne", "burger", "nuggets", "postej", "frikadeller", "pølser", "spread",
  "smørepålæg", "drik", "juice", "saft", "smoothie", "bar", "barer", "chokolade", "marinade", "krydderi",
  "bouillon", "fond", "færdigret", "måltid", "wraps", "chili", "karry", "pesto", "pålægssalat",
];

/** Never food (matched anywhere in a word, so "opvasketabs" is caught too). */
const NON_FOOD = [
  "shampoo", "balsam", "tandpasta", "tandbørste", "deodorant", "sæbe", "opvask", "vaskemiddel", "skyllemiddel",
  "toiletpapir", "køkkenrulle", "bleer", "vådserviet", "batteri", "kattemad", "hundemad", "foder", "kattegrus",
  "blomst", "stearin", "cigaret", "tobak",
];

const LETTERS = "a-zæøåäöüé";

/** Meaningful lower-case words of an ingredient name ("400 g hakket oksekød (8-12 %)" -> ["hakket", "oksekød"]). */
export function ingredientTokens(ingredient: string): string[] {
  const name = parseIngredient(ingredient).name;
  const cleaned = normalizeItem(name)
    .replace(/\(.*?\)/gu, " ")
    .split(/[,;]| - /u)[0] ?? "";
  return cleaned
    .split(new RegExp(`[^${LETTERS}]+`, "u"))
    .filter((word) => word.length >= 3 && !FILLER.has(word));
}

// Matching runs for every ingredient of every dish against every offer, so the work per offer and per
// word is done once.
const startPatterns = new Map<string, RegExp>();
const startsWord = (text: string, word: string): boolean => {
  let pattern = startPatterns.get(word);
  if (!pattern) {
    pattern = new RegExp(`(^|[^${LETTERS}])${word}`, "u");
    if (startPatterns.size > 5000) startPatterns.clear();
    startPatterns.set(word, pattern);
  }
  return pattern.test(text);
};

const SPLIT = new RegExp(`[^${LETTERS}]+`, "u");
const words = (text: string): string[] => text.split(SPLIT).filter(Boolean);

type Prepared = { text: string; words: string[]; nonFood: boolean };
const prepared = new WeakMap<object, Prepared>();
function prepare(offer: Pick<RetailOffer, "name">): Prepared {
  let entry = prepared.get(offer);
  if (!entry) {
    const text = normalizeItem(offer.name);
    const list = words(text);
    entry = { text, words: list, nonFood: list.some((word) => NON_FOOD.some((bad) => word.includes(bad))) };
    prepared.set(offer, entry);
  }
  return entry;
}

/** True when the offer is (a pack of) the ingredient. */
export function offerMatches(ingredient: string, offer: Pick<RetailOffer, "name">): boolean {
  return tokensMatch(ingredientTokens(ingredient), offer);
}

function tokensMatch(tokens: readonly string[], offer: Pick<RetailOffer, "name">): boolean {
  if (tokens.length === 0) return false;
  const { text, words: offerWords, nonFood } = prepare(offer);
  if (nonFood) return false;
  if (!tokens.every((token) => startsWord(text, token))) return false;
  const wanted = new Set(tokens);
  // "kylling" must not match "kyllingepålæg": a processed word in the offer (alone or as a compound
  // ending) rules it out unless the ingredient asks for it.
  return !offerWords.some((word) =>
    PROCESSED.some((bad) => (word === bad || (bad.length >= 4 && word.endsWith(bad) && word.length > bad.length + 2)) && ![...wanted].some((token) => token.includes(bad))),
  );
}

/** Running on `asOf` (inclusive), per the offer's own dates. */
export function offerCurrent(offer: Pick<RetailOffer, "validFrom" | "validUntil">, asOf: string): boolean {
  return offer.validUntil >= asOf && (offer.validFrom === null || offer.validFrom <= asOf);
}

/** Every current offer for the ingredient in the given stores, best first (closest name, then cheapest). */
export function matchingOffers(
  ingredient: string,
  offers: readonly RetailOffer[],
  stores: readonly GroceryStore[],
  asOf: string,
): RetailOffer[] {
  const tokens = ingredientTokens(ingredient);
  return offers
    .filter((offer) => stores.includes(offer.chain) && offerCurrent(offer, asOf) && tokensMatch(tokens, offer))
    .map((offer) => ({ offer, extra: prepare(offer).words.length - tokens.length }))
    .sort((a, b) => a.extra - b.extra || a.offer.amountOre - b.offer.amountOre)
    .map(({ offer }) => offer);
}

const kroner = (ore: number): string => `${(ore / 100).toFixed(2).replace(".", ",")} kr.`;

/** "3 for 30,00 kr." when the offer has a multi-buy, otherwise "". */
export function multiBuyLabel(offer: Pick<RetailOffer, "multiBuy">): string {
  return offer.multiBuy ? `${offer.multiBuy.quantity} for ${kroner(offer.multiBuy.priceOre)}` : "";
}

/** Short Danish price text: "12,95 kr." or, with a multi-buy, "12,95 kr. · 3 for 30,00 kr." (the price is for one). */
export function offerPriceLabel(offer: Pick<RetailOffer, "amountOre" | "multiBuy">): string {
  return [kroner(offer.amountOre), multiBuyLabel(offer)].filter(Boolean).join(" · ");
}

/** The reference stored on shopping items, meals and draft days. */
export function toOfferReference(offer: RetailOffer): OfferReference {
  return {
    store: STORE_NAMES[offer.chain],
    item: offer.quantityLabel ? `${offer.name} (${offer.quantityLabel})` : offer.name,
    price: offerPriceLabel(offer),
    ...(offer.validFrom ? { validFrom: offer.validFrom } : {}),
    validUntil: offer.validUntil,
    sourceUrl: offer.sourceUrl,
  };
}

/** Best current offer for one ingredient across the stores, as a reference; undefined when none fits. */
export function bestOffer(
  ingredient: string,
  offers: readonly RetailOffer[],
  stores: readonly GroceryStore[],
  asOf: string,
): OfferReference | undefined {
  const [best] = matchingOffers(ingredient, offers, stores, asOf);
  return best ? toOfferReference(best) : undefined;
}

/** Input for compareBaskets: the matches per ingredient label. */
export function offerResult(
  ingredients: readonly string[],
  offers: readonly RetailOffer[],
  stores: readonly GroceryStore[],
  asOf: string,
): RetailOfferResult {
  return {
    offers: [...new Set(ingredients)].map((ingredient) => ({ ingredient, matches: matchingOffers(ingredient, offers, stores, asOf) })),
    asOf,
    exhausted: false,
    remainingRequests: 0,
    configured: true,
  };
}

/** Kroner saved on the best offer for an ingredient (0 when no normal price is known). */
export function offerSavingKr(offer: Pick<RetailOffer, "amountOre" | "normalPriceOre">): number {
  return offer.normalPriceOre && offer.normalPriceOre > offer.amountOre ? (offer.normalPriceOre - offer.amountOre) / 100 : 0;
}

// Planning --------------------------------------------------------------------------------------

export type DishOfferMatch = { ingredient: string; offer: RetailOffer };

/** The best current offer per ingredient of a dish (one per ingredient, ingredients in dish order). */
export function dishOfferMatches(
  dish: Pick<Dish, "ingredients">,
  offers: readonly RetailOffer[],
  stores: readonly GroceryStore[],
  asOf: string,
): DishOfferMatch[] {
  if (offers.length === 0 || stores.length === 0) return [];
  const current = offers.filter((offer) => stores.includes(offer.chain) && offerCurrent(offer, asOf));
  return dish.ingredients.flatMap((line) => {
    const ingredient = parseIngredient(line).name;
    const [best] = matchingOffers(ingredient, current, stores, asOf);
    return best ? [{ ingredient, offer: best }] : [];
  });
}

/**
 * Soft bonus for planning: a few points per ingredient on offer, more for a real saving. Capped so an
 * offer never outweighs ratings, exclusions (which filter anyway) or variety.
 */
export function offerScore(matches: readonly DishOfferMatch[]): number {
  const raw = matches.reduce((total, match) => total + 5 + Math.min(8, offerSavingKr(match.offer) / 2), 0);
  return Math.min(24, Math.round(raw));
}

/** "Hakket oksekød er på tilbud i Netto." for the match with the biggest saving, or "". */
export function offerReason(matches: readonly DishOfferMatch[]): string {
  const [best] = [...matches].sort((a, b) => offerSavingKr(b.offer) - offerSavingKr(a.offer));
  if (!best) return "";
  const name = best.ingredient.charAt(0).toLocaleUpperCase("da-DK") + best.ingredient.slice(1);
  return `${name} er på tilbud i ${STORE_NAMES[best.offer.chain]}.`;
}

// Watched items ("Tilbudsvagt") -----------------------------------------------------------------

/** Most items one household watches, and the longest name. */
export const WATCHLIST_MAX = 50;
export const WATCH_NAME_MAX = 80;

const WATCH_FILLER = new Set(["og", "eller", "af", "med", "til", "på", "en", "et"]);

/** Lower-case words of a watched item, brand words included ("Lurpak smør" -> ["lurpak", "smør"]). */
export function watchTokens(name: string): string[] {
  return words(normalizeItem(name)).filter((word) => word.length >= 2 && !WATCH_FILLER.has(word));
}

/** True when the offer has every word of a free-text watch (word starts, in name or brand). */
export function watchWordsMatch(name: string, offer: Pick<RetailOffer, "name" | "brand">): boolean {
  const tokens = watchTokens(name);
  if (tokens.length === 0) return false;
  const text = normalizeItem(`${offer.name} ${offer.brand ?? ""}`);
  return tokens.every((token) => startsWord(text, token));
}

/** The exact product of an offer, to watch it. */
export function watchedProduct(offer: Pick<RetailOffer, "productId" | "name" | "brand">): WatchedProduct {
  return { ...(offer.productId !== undefined ? { productId: offer.productId } : {}), name: offer.name, ...(offer.brand ? { brand: offer.brand } : {}) };
}

/** "Lurpak Smør": the brand first unless the name already says it. */
export function productLabel(offer: Pick<RetailOffer, "name" | "brand">): string {
  const brand = offer.brand?.trim();
  return brand && !normalizeItem(offer.name).includes(normalizeItem(brand)) ? `${brand} ${offer.name}` : offer.name;
}

/** True when the offer is the watched product (same Prej id; without ids the same name and brand). */
export function sameProduct(product: WatchedProduct, offer: Pick<RetailOffer, "productId" | "name" | "brand">): boolean {
  if (product.productId !== undefined && offer.productId !== undefined) return product.productId === offer.productId;
  return normalizeItem(product.name) === normalizeItem(offer.name) && normalizeItem(product.brand ?? "") === normalizeItem(offer.brand ?? "");
}

/** True when two watch items watch the same thing (to avoid duplicates). */
export function sameWatch(a: WatchItem, b: WatchItem): boolean {
  if (a.product && b.product) return sameProduct(a.product, b.product);
  return !a.product && !b.product && normalizeItem(a.name) === normalizeItem(b.name);
}

/** Does a watch item catch this offer? */
export function watchCatches(item: WatchItem, offer: Pick<RetailOffer, "productId" | "name" | "brand">): boolean {
  return item.product ? sameProduct(item.product, offer) : watchWordsMatch(item.name, offer);
}

/**
 * Current offers for a watched item, cheapest first. Free text is looser than ingredient matching: the
 * family asked for exactly this, so brands and non-food ("bleer", "opvasketabs") count. Every word must
 * still start a word, so "øl" never finds "pølser". A product watch only finds that product.
 */
export function watchMatches(
  item: WatchItem,
  offers: readonly RetailOffer[],
  stores: readonly GroceryStore[],
  asOf: string,
): RetailOffer[] {
  return offers
    .filter((offer) => stores.includes(offer.chain) && offerCurrent(offer, asOf) && watchCatches(item, offer))
    .sort((a, b) => a.amountOre - b.amountOre || a.name.localeCompare(b.name, "da-DK"));
}

export type WatchHit = { item: WatchItem; offers: RetailOffer[] };

/** Every watched item with its current offers (an empty list when it is not on offer anywhere). */
export function watchlistHits(
  watchlist: readonly WatchItem[],
  offers: readonly RetailOffer[],
  stores: readonly GroceryStore[],
  asOf: string,
): WatchHit[] {
  return watchlist.map((item) => ({ item, offers: watchMatches(item, offers, stores, asOf) }));
}
