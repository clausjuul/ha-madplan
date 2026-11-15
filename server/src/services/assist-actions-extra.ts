/**
 * The second batch of Assist actions: editing and archiving dishes, several days at once, shopping-list
 * ticks and dish ingredients, basisvarer, settings and family members. Same contract as assist-actions.ts:
 * parse turns untrusted model output into a typed action with a server-made label, check decides whether
 * it may run against the CURRENT data (and runs again at apply time).
 */
import { addDaysToKey, daysBetween, formatFullDate, isDateKey, normalizeItem, STORE_NAMES } from "@madplan/domain";
import type { AssistAction, DishChanges, GroceryStore } from "@madplan/domain";
import { isRec, oneOf, str } from "../validate-basic.ts";
import type { ActionEnv } from "./assist-actions.ts";

export const EXTRA_ACTION_TYPES = [
  "updateDish", "archiveDish", "clearMeals", "copyMeals", "moveMeals", "addDishToShopping",
  "checkShoppingItems", "resetShopping", "addPantryItem", "removePantryItem", "setPreferredStores",
  "setServings", "watchOffer", "addProfile", "removeProfile", "setProfileActive", "setProfilePortions",
] as const;
export type ExtraActionType = (typeof EXTRA_ACTION_TYPES)[number];
type ExtraAction = Extract<AssistAction, { type: ExtraActionType }>;

const MAX_RANGE_DAYS = 28;
const MAX_SHIFT_DAYS = 14;
const MAX_ITEMS = 40;
const same = (a: string, b: string): boolean => normalizeItem(a) === normalizeItem(b);
const day = (date: string): string => formatFullDate(date);

function date(value: unknown, what: string): string {
  if (!isDateKey(value)) throw new Error(`${what} er ikke en gyldig dato.`);
  return value;
}

function range(raw: Record<string, unknown>): { from: string; to: string } {
  const from = date(raw.from, "Fra-datoen");
  const to = date(raw.to, "Til-datoen");
  if (to < from) throw new Error("Til-datoen ligger før fra-datoen.");
  if (daysBetween(from, to) >= MAX_RANGE_DAYS) throw new Error(`Højst ${MAX_RANGE_DAYS} dage ad gangen.`);
  return { from, to };
}

function int(value: unknown, what: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${what} skal være et helt tal fra ${min} til ${max}.`);
  return n;
}

function portions(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.5 || n > 30) throw new Error("Portioner skal være mellem 0,5 og 30.");
  return Math.round(n * 2) / 2;
}

function textList(value: unknown, what: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) throw new Error(`${what} skal være en liste.`);
  const items = value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
  if (items.length === 0 || items.length > maxItems) throw new Error(`${what} skal have 1-${maxItems} punkter.`);
  return items.map((entry) => entry.slice(0, maxLength));
}

const datesIn = (from: string, to: string): string[] =>
  Array.from({ length: daysBetween(from, to) + 1 }, (_, index) => addDaysToKey(from, index));

const dishName = (env: ActionEnv, id: string): string => env.dish(id)?.name ?? "ukendt ret";

function dishChanges(raw: unknown): DishChanges {
  const o = isRec(raw) ? raw : {};
  const changes: DishChanges = {};
  if (o.name !== undefined && o.name !== null) changes.name = str(o.name, "Navn", { min: 1, max: 130 });
  if (o.category !== undefined && o.category !== null) changes.category = str(o.category, "Kategori", { min: 1, max: 60 });
  if (o.ingredients !== undefined && o.ingredients !== null) changes.ingredients = textList(o.ingredients, "Ingredienser", 100, 200);
  if (o.instructions !== undefined && o.instructions !== null) changes.instructions = textList(o.instructions, "Fremgangsmåde", 80, 1000);
  if (o.prepMinutes !== undefined && o.prepMinutes !== null) changes.prepMinutes = int(o.prepMinutes, "Tiden", 1, 1440);
  if (o.servings !== undefined && o.servings !== null) changes.servings = portions(o.servings) ?? undefined;
  if (typeof o.favorite === "boolean") changes.favorite = o.favorite;
  if (Object.keys(changes).length === 0) throw new Error("Der er intet at ændre på retten.");
  return changes;
}

const CHANGE_NAMES: Record<keyof DishChanges, string> = {
  name: "navn",
  category: "kategori",
  ingredients: "ingredienser",
  instructions: "fremgangsmåde",
  prepMinutes: "tid",
  servings: "portioner",
  favorite: "favorit",
};

function describeChanges(changes: DishChanges): string {
  if (Object.keys(changes).length === 1 && changes.favorite !== undefined) return changes.favorite ? "marker som favorit" : "fjern som favorit";
  if (Object.keys(changes).length === 1 && changes.name) return `omdøb til «${changes.name}»`;
  return `ret ${Object.keys(changes).map((key) => CHANGE_NAMES[key as keyof DishChanges]).join(", ")}`;
}

/** What of a dish is not at home (basisvarer, fridge) and not already an extra on the list. */
export function missingIngredients(env: ActionEnv, ingredients: readonly string[], onlyMissing: boolean): string[] {
  const home = [...env.pantry, ...env.fridge.map((item) => item.name)].map(normalizeItem).filter(Boolean);
  const isHome = (line: string): boolean => {
    const key = normalizeItem(line);
    return home.some((have) => key === have || key.includes(have));
  };
  const seen = new Set<string>();
  return ingredients.filter((line) => {
    const key = normalizeItem(line);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    if (env.extras.some((extra) => same(extra.label, line))) return false;
    return !onlyMissing || !isHome(line);
  }).slice(0, MAX_ITEMS);
}

export function parseExtraAction(type: ExtraActionType, raw: Record<string, unknown>, env: ActionEnv): ExtraAction {
  switch (type) {
    case "updateDish": {
      const dishId = str(raw.dishId, "Ret", { min: 1, max: 200 });
      const dish = env.dish(dishId);
      if (!dish) throw new Error("Retten findes ikke.");
      const changes = dishChanges(raw.changes);
      return { type, dishId, changes, label: `«${dish.name}»: ${describeChanges(changes)}` };
    }
    case "archiveDish": {
      const dishId = str(raw.dishId, "Ret", { min: 1, max: 200 });
      const dish = env.dish(dishId);
      if (!dish) throw new Error("Retten findes ikke.");
      const archived = raw.archived !== false;
      return { type, dishId, archived, label: archived ? `Arkivér «${dish.name}» (kan gendannes)` : `Gendan «${dish.name}»` };
    }
    case "clearMeals": {
      const { from, to } = range(raw);
      return { type, from, to, label: from === to ? `Ryd ${day(from)}` : `Ryd alle ulåste dage fra ${day(from)} til ${day(to)}` };
    }
    case "copyMeals": {
      const sourceFrom = date(raw.sourceFrom, "Kopiér fra");
      const targetFrom = date(raw.targetFrom, "Kopiér til");
      const dayCount = int(raw.dayCount, "Antal dage", 1, 14);
      if (sourceFrom === targetFrom) throw new Error("Kopiér til en anden dag.");
      const end = addDaysToKey(sourceFrom, dayCount - 1);
      return {
        type, sourceFrom, targetFrom, dayCount,
        label: `Kopiér ${dayCount === 1 ? day(sourceFrom) : `${day(sourceFrom)}-${day(end)}`} til ${dayCount === 1 ? day(targetFrom) : `${dayCount} dage fra ${day(targetFrom)}`}`,
      };
    }
    case "moveMeals": {
      const { from, to } = range(raw);
      const days = int(raw.days, "Antal dage", -MAX_SHIFT_DAYS, MAX_SHIFT_DAYS);
      if (days === 0) throw new Error("Flyt mindst én dag.");
      const what = from === to ? day(from) : `retterne fra ${day(from)} til ${day(to)}`;
      return { type, from, to, days, label: `Flyt ${what} ${Math.abs(days)} ${Math.abs(days) === 1 ? "dag" : "dage"} ${days > 0 ? "frem" : "tilbage"}` };
    }
    case "addDishToShopping": {
      const dishId = str(raw.dishId, "Ret", { min: 1, max: 200 });
      const dish = env.dish(dishId);
      if (!dish) throw new Error("Retten findes ikke.");
      const items = missingIngredients(env, dish.ingredients, raw.onlyMissing !== false);
      if (items.length === 0) throw new Error(`I har allerede alt til ${dish.name}.`);
      return { type, dishId, items, label: `Læg ${items.length} varer til «${dish.name}» på indkøbslisten: ${items.join(", ")}` };
    }
    case "checkShoppingItems": {
      const wanted = Array.isArray(raw.itemIds) ? raw.itemIds.filter((id): id is string => typeof id === "string") : [];
      const list = env.shoppingItems();
      const items = list.filter((item) => wanted.includes(item.id)).slice(0, 60);
      if (items.length === 0) throw new Error("Varerne står ikke på indkøbslisten.");
      const checked = raw.checked !== false;
      return {
        type, itemIds: items.map((item) => item.id), checked,
        label: `${checked ? "Kryds af" : "Fjern krydset ved"}: ${items.map((item) => item.label).join(", ")}`,
      };
    }
    case "resetShopping":
      return { type, label: "Nulstil indkøbslisten (fjern alle kryds og ekstra varer)" };
    case "addPantryItem": {
      const name = str(raw.name, "Basisvare", { min: 2, max: 60 });
      return { type, name, label: `Tilføj «${name}» til basisvarer (kommer ikke på indkøbslisten)` };
    }
    case "removePantryItem": {
      const name = str(raw.name, "Basisvare", { min: 1, max: 60 });
      return { type, name, label: `Fjern «${name}» fra basisvarer` };
    }
    case "setPreferredStores": {
      const raws = Array.isArray(raw.stores) ? raw.stores : [];
      const stores = [...new Set(raws.map((store) => oneOf(store, "Butik", ["netto", "rema1000"] as const)))] as GroceryStore[];
      const names = stores.map((store) => STORE_NAMES[store]).join(" og ");
      return { type, stores, label: stores.length ? `Hent tilbud fra ${names}` : "Hent ikke tilbud fra nogen butik" };
    }
    case "setServings": {
      const servings = portions(raw.servings);
      return { type, servings, label: servings ? `Planlæg med ${String(servings).replace(".", ",")} portioner` : "Beregn portioner ud fra familien" };
    }
    case "watchOffer": {
      const name = str(raw.name, "Vare", { min: 2, max: 60 });
      const remove = raw.remove === true;
      return { type, name, remove, label: remove ? `Stop tilbudsvagt på «${name}»` : `Sæt tilbudsvagt på «${name}»` };
    }
    case "addProfile": {
      const name = str(raw.name, "Navn", { min: 1, max: 60 });
      const amount = portions(raw.portions);
      return { type, name, ...(amount ? { portions: amount } : {}), label: `Tilføj ${name} til familien${amount ? ` (${String(amount).replace(".", ",")} portion)` : ""}` };
    }
    case "removeProfile":
    case "setProfileActive":
    case "setProfilePortions": {
      const profileId = str(raw.profileId, "Person", { min: 1, max: 200 });
      const profile = env.allProfiles.find((entry) => entry.id === profileId);
      if (!profile) throw new Error("Personen findes ikke.");
      if (type === "removeProfile") return { type, profileId, label: `Fjern ${profile.name} fra familien` };
      if (type === "setProfileActive") {
        const active = raw.active !== false;
        return { type, profileId, active, label: active ? `${profile.name} spiser med igen` : `${profile.name} spiser ikke med (tæller ikke med i planen)` };
      }
      const amount = portions(raw.portions);
      return { type, profileId, portions: amount, label: amount ? `${profile.name} spiser ${String(amount).replace(".", ",")} portion` : `${profile.name} spiser en almindelig portion` };
    }
  }
}

export function checkExtraAction(env: ActionEnv, action: ExtraAction): string | null {
  const past = (value: string): boolean => value < env.today;
  switch (action.type) {
    case "updateDish": {
      const dish = env.dish(action.dishId);
      if (!dish) return "Retten findes ikke.";
      if (action.changes.name && env.allDishNames().some((entry) => entry.id !== dish.id && same(entry.name, action.changes.name!))) {
        return "Der findes allerede en ret med det navn.";
      }
      return null;
    }
    case "archiveDish": {
      const dish = env.dish(action.dishId);
      if (!dish) return "Retten findes ikke.";
      return Boolean(dish.archivedAt) === action.archived ? "Står allerede sådan." : null;
    }
    case "clearMeals": {
      if (past(action.from)) return "Dagene ligger (delvis) i fortiden.";
      const dates = datesIn(action.from, action.to);
      return dates.some((value) => env.meal(value) && !env.meal(value)?.locked) ? null : "Der er ingen ulåste retter at rydde.";
    }
    case "copyMeals": {
      if (past(action.targetFrom)) return "Dagene ligger (delvis) i fortiden.";
      const sources = Array.from({ length: action.dayCount }, (_, index) => addDaysToKey(action.sourceFrom, index));
      const targets = sources.map((_, index) => addDaysToKey(action.targetFrom, index));
      if (targets.some((target) => sources.includes(target))) return "Dagene overlapper.";
      if (!sources.some((source) => env.meal(source))) return "Der er ingen retter at kopiere.";
      return null;
    }
    case "moveMeals": {
      const dates = datesIn(action.from, action.to);
      const moving = dates.filter((value) => env.meal(value));
      if (moving.length === 0) return "Der er ingen retter at flytte.";
      if (moving.some((value) => env.meal(value)?.locked)) return "En af dagene er låst. Lås den op først.";
      const targets = moving.map((value) => addDaysToKey(value, action.days));
      if ([...moving, ...targets].some(past)) return "Dagene ligger (delvis) i fortiden.";
      if (targets.some((target) => !dates.includes(target) && env.meal(target)?.locked)) return "En af de nye dage er låst.";
      return null;
    }
    case "addDishToShopping":
      return env.dish(action.dishId) ? null : "Retten findes ikke.";
    case "checkShoppingItems": {
      const list = env.shoppingItems();
      const changes = list.filter((item) => action.itemIds.includes(item.id) && item.checked !== action.checked);
      return changes.length > 0 ? null : "Står allerede sådan.";
    }
    case "resetShopping":
      return null;
    case "addPantryItem":
      if (env.pantry.some((name) => same(name, action.name))) return "Er allerede en basisvare.";
      return env.pantry.length >= 200 ? "Listen over basisvarer er fuld." : null;
    case "removePantryItem":
      return env.pantry.some((name) => same(name, action.name)) ? null : "Er ikke en basisvare.";
    case "setPreferredStores":
      return [...env.settings.preferredStores].sort().join() === [...action.stores].sort().join() ? "Står allerede sådan." : null;
    case "setServings":
      return (env.settings.preferredServings ?? null) === action.servings ? "Står allerede sådan." : null;
    case "watchOffer": {
      const has = (env.settings.offerWatchlist ?? []).some((item) => same(item.name, action.name));
      if (action.remove) return has ? null : "Der er ingen tilbudsvagt på den vare.";
      return has ? "Der er allerede tilbudsvagt på den vare." : null;
    }
    case "addProfile":
      if (env.allProfiles.length >= 30) return "Der er ikke plads til flere personer.";
      return env.allProfiles.some((profile) => same(profile.name, action.name)) ? "Der er allerede en person med det navn." : null;
    case "removeProfile":
      if (!env.allProfiles.some((profile) => profile.id === action.profileId)) return "Personen findes ikke.";
      return env.allProfiles.length <= 1 ? "Der skal være mindst én person i familien." : null;
    case "setProfileActive": {
      const profile = env.allProfiles.find((entry) => entry.id === action.profileId);
      if (!profile) return "Personen findes ikke.";
      return profile.active === action.active ? "Står allerede sådan." : null;
    }
    case "setProfilePortions": {
      const profile = env.allProfiles.find((entry) => entry.id === action.profileId);
      if (!profile) return "Personen findes ikke.";
      return (profile.portions ?? null) === action.portions ? "Står allerede sådan." : null;
    }
  }
}
