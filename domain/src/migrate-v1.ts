/**
 * Pure migration of a stored v1 meal plan (old add-on database or dashboard localStorage) into v2 entities.
 * Tolerates the sparse/legacy shapes accepted by the old normalizeMealPlanState/readState, and reports
 * everything that has no place in v2 as a Danish warning instead of failing.
 */
import { DISH_BY_ID } from "./catalog/dishes.ts";
import { INSPIRATION_RECIPES } from "./catalog/inspiration.ts";
import { isDateKey } from "./dates.ts";
import { parseExclusionTerms } from "./exclusions.ts";
import { INSPIRATION_CUISINES } from "./types.ts";
import type {
  Dish,
  FridgeItem,
  GroceryStore,
  InspirationRecipe,
  MadplanData,
  Meal,
  MealMap,
  MealSource,
  OfferReference,
  Profile,
  ShoppingListState,
} from "./types.ts";

export type MigrationOptions = {
  /** ISO timestamp used for `archivedAt` of hidden dishes (keeps the function pure). */
  now: string;
};

export type MigrationResult =
  | { ok: true; data: MadplanData; warnings: string[] }
  | { ok: false; error: string };

/** List id used for the shopping state a v1 calendar week (keyed by its Monday) carried. */
export const legacyWeekListId = (weekKey: string): string => `week:${weekKey}`;

type Rec = Record<string, unknown>;
const isRec = (value: unknown): value is Rec =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const dedupe = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase("da-DK");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export function migrateV1(input: unknown, options: MigrationOptions): MigrationResult {
  if (!isRec(input) || input.version !== 1 || !isRec(input.meals)) {
    return { ok: false, error: "Ukendt format eller version: forventede MealPlanState version 1." };
  }
  const warnings: string[] = [];
  const dishes = migrateDishes(input, options.now, warnings);
  const known = new Set([...DISH_BY_ID.keys(), ...dishes.map((dish) => dish.id)]);
  const data: MadplanData = {
    meals: migrateMeals(input, known, warnings),
    dishes,
    profiles: migrateProfiles(input.household, warnings),
    fridge: migrateFridge(input, warnings),
    pantry: dedupe(strings(input.pantryStaples).map((item) => item.trim()).filter(Boolean)),
    settings: {
      globalExclusions: dedupe(
        typeof input.globalExclusions === "string"
          ? input.globalExclusions.split(/[,;\n]+/u).map((term) => term.trim()).filter(Boolean)
          : [],
      ),
      preferredStores: strings(input.preferredStores).filter(
        (store): store is GroceryStore => store === "netto" || store === "rema1000",
      ),
      preferredServings: servings(input.preferredServings),
    },
    shoppingLists: migrateShopping(input.shoppingListsByWeek),
    savedInspirations: migrateInspirations(input, warnings),
  };
  if (data.settings.preferredServings === undefined) delete data.settings.preferredServings;
  for (const term of data.settings.globalExclusions) {
    // v1 stored free text; a sentence-like term only matches the whole phrase, so the user must review it.
    if (term.split(/\s+/u).length > 3) {
      warnings.push(
        `Fravalget "${term}" er en sætning og matcher kun hele teksten. Del det op i enkelte råvarer under Indstillinger.`,
      );
    }
  }
  warnAboutDropped(input, warnings);
  return { ok: true, data, warnings };
}

function servings(value: unknown): number | undefined {
  const n = num(value);
  return n !== undefined && n >= 0.5 && n <= 30 ? n : undefined;
}

/** "/meal-plan/dishes/lasagne.jpg" -> bundled imageKey; other non-empty URLs are kept as imageUrl. */
function imageFields(value: unknown): { imageKey?: string; imageUrl?: string } {
  if (typeof value !== "string" || !value.trim()) return {};
  const bundled = /^\/meal-plan\/(?:dishes|inspiration)\/([a-z0-9-]+)\.jpg$/u.exec(value);
  return bundled?.[1] ? { imageKey: bundled[1] } : { imageUrl: value };
}

function migrateDishes(input: Rec, now: string, warnings: string[]): Dish[] {
  const result = new Map<string, Dish>();
  for (const raw of Array.isArray(input.customDishes) ? input.customDishes : []) {
    if (
      !isRec(raw) ||
      typeof raw.id !== "string" ||
      typeof raw.name !== "string" ||
      !Array.isArray(raw.ingredients) ||
      typeof raw.prepMinutes !== "number" ||
      typeof raw.category !== "string"
    ) {
      warnings.push("En gemt ret havde ugyldige data og blev ikke flyttet med.");
      continue;
    }
    const dish: Dish = {
      id: raw.id,
      name: raw.name,
      ingredients: strings(raw.ingredients),
      prepMinutes: raw.prepMinutes,
      category: raw.category,
      favorite: raw.favorite === true,
      leftoverFriendly: raw.leftoverFriendly === true,
      freezerFriendly: raw.freezerFriendly === true,
      custom: true,
      ...imageFields(raw.imageUrl),
    };
    const dishServings = num(raw.servings);
    if (dishServings !== undefined) dish.servings = dishServings;
    if (typeof raw.sourceUrl === "string") dish.sourceUrl = raw.sourceUrl;
    if (Array.isArray(raw.instructions)) dish.instructions = strings(raw.instructions);
    if (raw.generated === true) dish.generated = true;
    result.set(dish.id, dish);
  }
  for (const id of dedupe(strings(input.hiddenDishIds))) {
    const custom = result.get(id);
    const builtIn = DISH_BY_ID.get(id);
    if (custom) result.set(id, { ...custom, archivedAt: now });
    else if (builtIn) result.set(id, { ...builtIn, ingredients: [...builtIn.ingredients], archivedAt: now });
    else warnings.push(`Skjult ret "${id}" findes ikke længere og blev ignoreret.`);
  }
  return [...result.values()];
}

function migrateMeals(input: Rec, known: ReadonlySet<string>, warnings: string[]): MealMap {
  const meals: MealMap = {};
  const skippedStatus = new Set<string>();
  for (const [date, raw] of Object.entries(input.meals as Rec)) {
    if (!isDateKey(date) || !isRec(raw) || typeof raw.dishId !== "string" || !raw.dishId) {
      warnings.push(`Måltidet for "${date}" havde ugyldige data og blev ikke flyttet med.`);
      continue;
    }
    const source: MealSource =
      raw.source === "local" || raw.source === "ai" ? raw.source : "manual";
    const meal: Meal = {
      dishId: raw.dishId,
      locked: raw.locked === true,
      note: typeof raw.note === "string" ? raw.note : "",
      source,
    };
    if (typeof raw.reason === "string") meal.reason = raw.reason;
    if (isRec(raw.offer) && typeof raw.offer.sourceUrl === "string") {
      meal.offer = raw.offer as unknown as OfferReference;
    }
    if (raw.status === "skipped") {
      meal.skipped = true;
      skippedStatus.add(date);
    }
    meals[date] = meal;
  }

  // History entries only fill gaps; a meal that exists is authoritative for its dish.
  const seenHistory = new Set<string>();
  for (const entry of Array.isArray(input.history) ? input.history : []) {
    if (
      !isRec(entry) ||
      !isDateKey(entry.date) ||
      typeof entry.dishId !== "string" ||
      (entry.status !== "eaten" && entry.status !== "skipped")
    ) {
      warnings.push("En historikpost havde ugyldige data og blev ikke flyttet med.");
      continue;
    }
    if (seenHistory.has(entry.date)) {
      warnings.push(`Flere historikposter for ${entry.date}; kun den første blev brugt.`);
      continue;
    }
    seenHistory.add(entry.date);
    const meal = meals[entry.date];
    if (!meal) {
      meals[entry.date] = {
        dishId: entry.dishId,
        locked: false,
        note: "",
        source: "manual",
        ...(entry.status === "skipped" ? { skipped: true } : {}),
      };
      continue;
    }
    if (meal.dishId !== entry.dishId) {
      warnings.push(`Historikken for ${entry.date} nævner en anden ret end madplanen; madplanens ret blev brugt.`);
    }
    if (entry.status === "skipped" && !meal.skipped) meal.skipped = true;
    else if (entry.status === "eaten" && skippedStatus.has(entry.date)) {
      warnings.push(`${entry.date} står som både spist og sprunget over; den blev markeret som sprunget over.`);
    }
  }

  for (const [date, meal] of Object.entries(meals)) {
    if (!known.has(meal.dishId)) {
      warnings.push(`Måltidet ${date} peger på en ukendt ret ("${meal.dishId}"); det blev beholdt.`);
    }
  }
  return meals;
}

function migrateProfiles(value: unknown, warnings: string[]): Profile[] {
  const seen = new Set<string>();
  const profiles: Profile[] = [];
  for (const raw of Array.isArray(value) ? value : []) {
    if (!isRec(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") {
      warnings.push("En brugerprofil havde ugyldige data og blev ikke flyttet med.");
      continue;
    }
    if (seen.has(raw.id)) {
      warnings.push(`Brugerprofilen "${raw.name}" havde et id, der allerede var i brug, og blev sprunget over.`);
      continue;
    }
    seen.add(raw.id);
    const profile: Profile = {
      id: raw.id,
      name: raw.name,
      active: raw.active !== false,
      exclusions: strings(raw.exclusions),
      preferences: strings(raw.preferences),
      dislikes: strings(raw.dislikes),
      favoriteDishIds: strings(raw.favoriteDishIds),
    };
    const portions = num(raw.portions);
    if (portions !== undefined && portions >= 0.5 && portions <= 8) profile.portions = portions;
    else if (raw.portions !== undefined) warnings.push(`Portioner for "${raw.name}" var ugyldige og blev sat til standard.`);
    profiles.push(profile);
  }
  return profiles;
}

function migrateFridge(input: Rec, warnings: string[]): FridgeItem[] {
  const details = isRec(input.fridgeDetails) ? input.fridgeDetails : {};
  const names = dedupe(strings(input.fridge).map((name) => name.trim()).filter(Boolean));
  const items = names.map((name): FridgeItem => {
    const detail = details[name];
    const item: FridgeItem = { name };
    if (isRec(detail)) {
      if (typeof detail.quantity === "string" && detail.quantity.trim()) item.quantity = detail.quantity;
      if (isDateKey(detail.expiresOn)) item.expiresOn = detail.expiresOn;
      if (detail.useFirst === true) item.useFirst = true;
    }
    return item;
  });
  for (const name of Object.keys(details)) {
    if (!names.includes(name)) warnings.push(`Detaljer for "${name}" blev droppet, fordi varen ikke er i køleskabet.`);
  }
  return items;
}

function migrateShopping(value: unknown): Record<string, ShoppingListState> {
  const lists: Record<string, ShoppingListState> = {};
  for (const [week, raw] of Object.entries(isRec(value) ? value : {})) {
    if (!isRec(raw)) continue;
    const checked = dedupe(strings(raw.checkedItems));
    const extras = dedupe(strings(raw.extraItems).map((label) => label.trim()).filter(Boolean));
    if (!checked.length && !extras.length) continue;
    lists[legacyWeekListId(week)] = { checked, extras: extras.map((label) => ({ label })) };
  }
  return lists;
}

function migrateInspirations(input: Rec, warnings: string[]): InspirationRecipe[] {
  const result = new Map<string, InspirationRecipe>();
  for (const raw of Array.isArray(input.savedInspirationRecipes) ? input.savedInspirationRecipes : []) {
    if (
      !isRec(raw) ||
      typeof raw.id !== "string" ||
      typeof raw.name !== "string" ||
      typeof raw.sourceUrl !== "string"
    ) {
      warnings.push("En gemt inspirationsopskrift havde ugyldige data og blev ikke flyttet med.");
      continue;
    }
    const cuisine = INSPIRATION_CUISINES.find((item) => item === raw.cuisine);
    if (!cuisine) warnings.push(`Køkkenet for "${raw.name}" var ukendt og blev sat til International.`);
    result.set(raw.id, {
      id: raw.id,
      name: raw.name,
      cuisine: cuisine ?? "International",
      prepMinutes: num(raw.prepMinutes) ?? 30,
      description: typeof raw.description === "string" ? raw.description : "",
      tags: strings(raw.tags),
      sourceName: typeof raw.sourceName === "string" ? raw.sourceName : "",
      sourceUrl: raw.sourceUrl,
      ...imageFields(raw.imageUrl),
    });
  }
  for (const id of strings(input.savedInspirationIds)) {
    if (result.has(id)) continue;
    const catalog = INSPIRATION_RECIPES.find((recipe) => recipe.id === id);
    if (catalog) result.set(id, catalog);
    else warnings.push(`Gemt inspiration "${id}" kunne ikke findes og blev droppet.`);
  }
  return [...result.values()];
}

function nonEmpty(value: unknown): boolean {
  return isRec(value) ? Object.keys(value).length > 0 : Array.isArray(value) && value.length > 0;
}

/** Things v2 deliberately has no place for. */
function warnAboutDropped(input: Rec, warnings: string[]): void {
  if (nonEmpty(input.planningSettingsByWeek)) {
    warnings.push("Ugespecifikke planlægningsindstillinger (antal dage, ønsker, budget) blev ikke flyttet med.");
  }
  if (nonEmpty(input.includedDishesByWeek)) {
    warnings.push("Forhåndsvalgte retter pr. uge blev ikke flyttet med.");
  }
  if (isRec(input.undoMealPlan)) {
    warnings.push("Fortryd-historikken for madplanen blev ikke flyttet med.");
  }
}
