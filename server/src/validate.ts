/** Validators for the request bodies in the API contract (domain/src/api.ts). */
import { INSPIRATION_CUISINES, isDateKey, WATCH_NAME_MAX, WATCHLIST_MAX } from "@madplan/domain";
import { PHOTO_DATA_URL } from "./store-photos.ts";
import type {
  DiscoverInput,
  DishDraftInput,
  DishImagesInput,
  DishInput,
  DishReadInput,
  DraftDayPatch,
  FridgeItem,
  InspirationRecipe,
  MealInput,
  OfferReference,
  PlanRequest,
  MealVariant,
  Profile,
  Settings,
  WatchedProduct,
  WatchItem,
} from "@madplan/domain";
import { badRequest } from "./errors.ts";
import {
  bool,
  compact,
  list,
  num,
  oneOf,
  optBool,
  optNum,
  optStr,
  optStrList,
  rec,
  str,
  strList,
} from "./validate-basic.ts";

export function dateParam(value: string | undefined): string {
  if (!isDateKey(value)) throw badRequest("Ugyldig dato. Brug formatet ÅÅÅÅ-MM-DD.");
  return value;
}

function offer(value: unknown): OfferReference {
  const o = rec(value, "Tilbud");
  return compact({
    store: oneOf(o.store, "Butik", ["Netto", "REMA 1000"] as const),
    item: str(o.item, "Tilbudsvare", { min: 1, max: 200 }),
    price: optStr(o.price, "Tilbudspris", 40),
    validFrom: optStr(o.validFrom, "Tilbud fra", 20),
    validUntil: optStr(o.validUntil, "Tilbud til", 20),
    sourceUrl: str(o.sourceUrl, "Tilbudslink", { min: 1, max: 600 }),
  });
}

const SOURCES = ["manual", "local", "ai"] as const;

export function mealInput(value: unknown, partial: boolean): Partial<MealInput> {
  const o = rec(value, "Måltid");
  if (!partial && o.dishId === undefined) throw badRequest("Måltidet mangler en ret.");
  return compact({
    dishId: o.dishId === undefined ? undefined : str(o.dishId, "Ret", { min: 1, max: 200 }),
    locked: optBool(o.locked, "Låst"),
    note: o.note === undefined ? undefined : str(o.note, "Note", { max: 500 }),
    source: o.source === undefined ? undefined : oneOf(o.source, "Kilde", SOURCES),
    reason: optStr(o.reason, "Begrundelse", 300),
    offer: o.offer === undefined ? undefined : offer(o.offer),
    skipped: optBool(o.skipped, "Sprunget over"),
    rating:
      o.rating === undefined
        ? undefined
        : o.rating === null
          ? null
          : oneOf(o.rating, "Bedømmelse", ["up", "down", "never"] as const),
    variants: o.variants === undefined ? undefined : o.variants === null ? null : variantList(o.variants),
  });
}

/** Shape only; whether a variant fits the dish and the profile is checked with normalizeVariants. */
export function variantList(value: unknown): MealVariant[] {
  return list(value, "Varianter", (entry) => {
    const o = rec(entry, "Variant");
    return {
      profileId: str(o.profileId, "Profil-id", { min: 1, max: 100 }),
      replaces: str(o.replaces, "Det, der byttes", { min: 1, max: 100 }),
      with: str(o.with, "Det, der byttes til", { min: 1, max: 100 }),
    };
  }, 10);
}

/** Longest step of a recipe's method (imported recipes can have long steps). */
export const MAX_STEP = 1000;
const MAX_IMAGES = 3;
/** A downscaled phone photo is well below this; the whole request is capped by the route. */
const MAX_IMAGE_CHARS = 5_000_000;
const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/u;

export function dishReadInput(value: unknown): DishReadInput {
  const o = rec(value, "Opskrift");
  if (o.url !== undefined) return { url: str(o.url, "Link", { min: 8, max: 1000 }) };
  // A whole recipe, or just a description of a dish ("lasagne med spinat").
  if (o.text !== undefined) return { text: str(o.text, "Tekst", { min: 3, max: 30_000 }) };
  if (o.images !== undefined) {
    const images = list(o.images, "Billeder", (entry) => {
      if (typeof entry !== "string" || entry.length > MAX_IMAGE_CHARS || !IMAGE_DATA_URL.test(entry)) {
        throw badRequest("Billederne skal være JPEG-, PNG- eller WebP-billeder.");
      }
      return entry;
    }, MAX_IMAGES);
    if (images.length === 0) throw badRequest("Vælg mindst ét billede.");
    return { images };
  }
  throw badRequest("Giv et link, en tekst eller billeder.");
}

export function dishImagesInput(value: unknown): DishImagesInput {
  const o = rec(value, "Ret");
  return { name: str(o.name, "Navn", { min: 2, max: 130 }) };
}

export function dishDraftInput(value: unknown): DishDraftInput {
  const o = rec(value, "Ret");
  return compact({ name: str(o.name, "Navn", { min: 2, max: 130 }), note: optStr(o.note, "Ønske", 300) });
}

/** Generous for a photo downscaled in the browser; the store checks the decoded size. */
const MAX_PHOTO_CHARS = 2_800_000;

/** A link to a picture, or a photo uploaded from the device as a data: URL (stored separately on save). */
function dishImage(value: unknown): string | undefined {
  if (typeof value === "string" && value.startsWith("data:")) {
    if (value.length > MAX_PHOTO_CHARS || !PHOTO_DATA_URL.test(value)) throw badRequest("Billedet kunne ikke bruges. Prøv et andet (JPEG eller PNG).");
    return value;
  }
  return optStr(value, "Billedlink", 1000);
}

export function dishInput(value: unknown): DishInput {
  const o = rec(value, "Ret");
  return compact({
    name: str(o.name, "Navn", { min: 1, max: 130 }),
    ingredients: strList(o.ingredients, "Ingredienser", 100, 200),
    servings: optNum(o.servings, "Portioner", { min: 0.5, max: 30 }),
    prepMinutes: num(o.prepMinutes, "Tilberedningstid", { min: 0, max: 1440 }),
    category: str(o.category, "Kategori", { min: 1, max: 60 }),
    favorite: o.favorite === undefined ? false : bool(o.favorite, "Favorit"),
    leftoverFriendly: o.leftoverFriendly === undefined ? false : bool(o.leftoverFriendly, "Rester"),
    freezerFriendly: o.freezerFriendly === undefined ? false : bool(o.freezerFriendly, "Fryser"),
    imageKey: optStr(o.imageKey, "Billednøgle", 100),
    imageUrl: dishImage(o.imageUrl),
    sourceUrl: optStr(o.sourceUrl, "Kildelink", 1000),
    instructions: o.instructions === undefined ? undefined : strList(o.instructions, "Fremgangsmåde", 80, MAX_STEP),
    generated: optBool(o.generated, "Genereret"),
  });
}

export function profiles(value: unknown): Profile[] {
  return list(value, "Profiler", (entry) => {
    const o = rec(entry, "Profil");
    return compact({
      id: str(o.id, "Profil-id", { min: 1, max: 100 }),
      name: str(o.name, "Profilnavn", { min: 1, max: 60 }),
      active: bool(o.active, "Aktiv"),
      exclusions: strList(o.exclusions, "Fravalg", 100, 80),
      preferences: strList(o.preferences, "Præferencer", 100, 80),
      dislikes: strList(o.dislikes, "Ikke-favoritter", 100, 80),
      safeFoods: o.safeFoods === undefined ? undefined : strList(o.safeFoods, "Spiser altid", 30, 80),
      favoriteDishIds: strList(o.favoriteDishIds, "Favoritretter", 500, 200),
      portions: optNum(o.portions, "Portioner", { min: 0.5, max: 30 }),
    });
  }, 30);
}

export function fridge(value: unknown): FridgeItem[] {
  return list(value, "Køleskab", (entry) => {
    const o = rec(entry, "Køleskabsvare");
    return compact({
      name: str(o.name, "Varenavn", { min: 1, max: 100 }),
      quantity: optStr(o.quantity, "Mængde", 60),
      expiresOn: optStr(o.expiresOn, "Udløbsdato", 20),
      useFirst: optBool(o.useFirst, "Brug først"),
    });
  }, 300);
}

export function settings(value: unknown): Settings {
  const o = rec(value, "Indstillinger");
  return compact({
    globalExclusions: strList(o.globalExclusions, "Fravalg", 100, 80),
    preferredStores: list(
      o.preferredStores,
      "Butikker",
      (entry) => oneOf(entry, "Butik", ["netto", "rema1000"] as const),
      2,
    ),
    preferredServings: optNum(o.preferredServings, "Portioner", { min: 0.5, max: 30 }),
    offerWatchlist: o.offerWatchlist === undefined ? undefined : watchlist(o.offerWatchlist),
  });
}

function watchlist(value: unknown): WatchItem[] {
  return list(value, "Tilbudsvagt", (entry) => {
    const o = rec(entry, "Vare");
    const name = str(o.name, "Vare", { min: 1, max: WATCH_NAME_MAX });
    if (o.product === undefined) return { name };
    const p = rec(o.product, "Produkt");
    const product: WatchedProduct = compact({
      productId: p.productId === undefined ? undefined : num(p.productId, "Produkt-id", { min: 0, max: Number.MAX_SAFE_INTEGER, int: true }),
      name: str(p.name, "Produktnavn", { min: 1, max: 200 }),
      brand: optStr(p.brand, "Mærke", 100),
    });
    return { name, product };
  }, WATCHLIST_MAX);
}

export function inspirations(value: unknown): InspirationRecipe[] {
  return list(value, "Inspiration", (entry) => {
    const o = rec(entry, "Opskrift");
    return compact({
      id: str(o.id, "Id", { min: 1, max: 200 }),
      name: str(o.name, "Navn", { min: 1, max: 130 }),
      cuisine: oneOf(o.cuisine, "Køkken", INSPIRATION_CUISINES),
      prepMinutes: num(o.prepMinutes, "Tilberedningstid", { min: 0, max: 1440 }),
      description: str(o.description, "Beskrivelse", { max: 600 }),
      tags: strList(o.tags, "Tags", 12, 40),
      sourceName: str(o.sourceName, "Kilde", { max: 100 }),
      sourceUrl: str(o.sourceUrl, "Kildelink", { max: 1000 }),
      imageKey: optStr(o.imageKey, "Billednøgle", 100),
      imageUrl: optStr(o.imageUrl, "Billedlink", 1000),
    });
  }, 500);
}

export function planRequest(value: unknown): PlanRequest {
  const o = rec(value, "Planønske");
  const dayRequests: Record<string, string> = {};
  for (const [date, wish] of Object.entries(o.dayRequests === undefined ? {} : rec(o.dayRequests, "Dagsønsker"))) {
    dayRequests[dateParam(date)] = str(wish, "Dagsønske", { max: 300 });
  }
  return compact({
    engine: oneOf(o.engine, "Motor", ["ai", "local"] as const),
    from: dateParam(typeof o.from === "string" ? o.from : undefined),
    dayCount: num(o.dayCount, "Antal dage", { min: 1, max: 14, int: true }),
    skippedDates: list(o.skippedDates ?? [], "Fravalgte dage", (d) => dateParam(typeof d === "string" ? d : undefined), 60),
    newDishCount: num(o.newDishCount ?? 0, "Antal nye retter", { min: 0, max: 14, int: true }),
    requiredDishIds: strList(o.requiredDishIds ?? [], "Valgte retter", 30),
    request: o.request === undefined ? "" : str(o.request, "Ønske", { max: 1000 }),
    dayRequests,
    maxPrepMinutes: optNum(o.maxPrepMinutes, "Maks. tilberedningstid", { min: 1, max: 1440 }),
    relaxedDates:
      o.relaxedDates === undefined
        ? undefined
        : list(o.relaxedDates, "Dage med god tid", (d) => dateParam(typeof d === "string" ? d : undefined), 14),
    budgetDkk: optNum(o.budgetDkk, "Budget", { min: 0, max: 100000 }),
    fridgeOverride: optStrList(o.fridgeOverride, "Køleskabsindhold", 100),
    seed: optNum(o.seed, "Seed", { int: true }),
  });
}

export function draftDayPatch(value: unknown): DraftDayPatch {
  const o = rec(value, "Dagsændring");
  return compact({
    locked: optBool(o.locked, "Låst"),
    dishId: optStr(o.dishId, "Ret", 200),
    variants: o.variants === undefined ? undefined : o.variants === null ? null : variantList(o.variants),
  });
}

export function discoverInput(value: unknown): DiscoverInput {
  const o = rec(value, "Søgning");
  return {
    request: o.request === undefined ? "" : str(o.request, "Søgetekst", { max: 500 }),
    cuisine: oneOf(o.cuisine, "Køkken", ["Alle", ...INSPIRATION_CUISINES] as const),
  };
}
