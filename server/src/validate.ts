/** Validators for the request bodies in the API contract (domain/src/api.ts). */
import { INSPIRATION_CUISINES, isDateKey } from "@madplan/domain";
import type {
  DiscoverInput,
  DishInput,
  DraftDayPatch,
  FridgeItem,
  InspirationRecipe,
  MealInput,
  OfferReference,
  PlanRequest,
  MealVariant,
  Profile,
  Settings,
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
    imageUrl: optStr(o.imageUrl, "Billedlink", 1000),
    sourceUrl: optStr(o.sourceUrl, "Kildelink", 1000),
    instructions: optStrList(o.instructions, "Fremgangsmåde", 80),
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
  });
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
