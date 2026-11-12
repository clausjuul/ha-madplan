/**
 * Assist actions: turning untrusted model output into typed, safe actions (parse) and deciding whether
 * an action is allowed against the CURRENT data (check). Both run when a proposal is created and the
 * check runs again when it is applied, so a stale or manipulated proposal can never bypass the rules.
 */
import {
  dishAllowed,
  dishConflictReasons,
  extraItemId,
  formatFullDate,
  isDateKey,
  parseExclusionTerms,
  weekdayName,
} from "@madplan/domain";
import type {
  AssistAction,
  Dish,
  FridgeItem,
  Meal,
  PlanRequest,
  Profile,
  Settings,
  ShoppingExtra,
} from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { snapshot } from "../state.ts";
import { findDish } from "../store-dishes.ts";
import { getShoppingState } from "../store-household.ts";
import { getMeal } from "../store-meals.ts";
import { dishInput, planRequest } from "../validate.ts";
import { isRec, oneOf, optStr, str } from "../validate-basic.ts";

export const MAX_ACTIONS = 8;
export const LOCKED_MESSAGE = "Måltidet er låst. Lås det op, før Assist ændrer det.";

/** Read access to the data an action is checked against. */
export type ActionEnv = {
  today: string;
  meal: (date: string) => Meal | undefined;
  dish: (id: string) => Dish | undefined;
  settings: Settings;
  profiles: Profile[];
  fridge: FridgeItem[];
  extras: ShoppingExtra[];
  aiAvailable: boolean;
};

/** Always reads fresh from the database, so call it again before every action that follows a write. */
export function envFromDb(deps: Deps): ActionEnv {
  const state = snapshot(deps);
  return {
    today: state.today,
    meal: (date) => getMeal(deps.repo.db, date),
    dish: (id) => findDish(deps.repo.db, id),
    settings: state.settings,
    profiles: state.profiles,
    fridge: state.fridge,
    extras: getShoppingState(deps.repo.db).extras,
    aiAvailable: deps.openai.configured,
  };
}

const sameName = (a: string, b: string): boolean => a.trim().toLocaleLowerCase("da-DK") === b.trim().toLocaleLowerCase("da-DK");
const dayName = (date: string): string => formatFullDate(date);

function dateField(value: unknown, what: string): string {
  if (!isDateKey(value)) throw new Error(`${what} er ikke en gyldig dato.`);
  return value;
}

function mealName(env: ActionEnv, date: string): string {
  const meal = env.meal(date);
  return meal ? `«${env.dish(meal.dishId)?.name ?? "ukendt ret"}»` : "ingen ret";
}

/**
 * Strict structured output has no optional fields, so the model sends null for "not given". Drop those
 * (one level down too, for dish and plan request), except where null carries meaning (rateMeal.rating).
 */
function withoutNulls(raw: Record<string, unknown>): Record<string, unknown> {
  const clean = (record: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(record).filter(([key, value]) => value !== null || (raw.type === "rateMeal" && key === "rating")));
  const top = clean(raw);
  for (const key of ["dish", "request"]) {
    const nested = top[key];
    if (isRec(nested)) top[key] = clean(nested);
  }
  return top;
}

/** Throws an Error with a Danish message when the raw action is malformed. Labels are made here, never by the model. */
export function parseAction(input: unknown, env: ActionEnv): AssistAction {
  if (!isRec(input)) throw new Error("Handlingen er ikke et objekt.");
  const raw = withoutNulls(input);
  const type = oneOf(raw.type, "Handlingstype", [
    "setMeal", "removeMeal", "swapMeals", "lockMeal", "addShoppingExtra", "addFridgeItem",
    "removeFridgeItem", "addGlobalExclusion", "updateProfile", "createDish", "startPlanDraft",
    "removeShoppingExtra", "setMealNote", "skipMeal", "rateMeal",
  ] as const);
  switch (type) {
    case "setMeal": {
      const date = dateField(raw.date, "Datoen");
      const dishId = str(raw.dishId, "Ret", { min: 1, max: 200 });
      const dish = env.dish(dishId);
      if (!dish) throw new Error("Retten findes ikke.");
      const current = env.meal(date);
      const replaces = current ? ` (erstatter ${mealName(env, date)})` : "";
      return { type, date, dishId, label: `Sæt «${dish.name}» på ${dayName(date)}${replaces}` };
    }
    case "removeMeal": {
      const date = dateField(raw.date, "Datoen");
      return { type, date, label: `Fjern ${mealName(env, date)} fra ${dayName(date)}` };
    }
    case "swapMeals": {
      const a = dateField(raw.a, "Første dato");
      const b = dateField(raw.b, "Anden dato");
      return {
        type, a, b,
        label: `Byt ${mealName(env, a)} (${weekdayName(a)}) med ${mealName(env, b)} (${weekdayName(b)})`,
      };
    }
    case "lockMeal": {
      const date = dateField(raw.date, "Datoen");
      if (typeof raw.locked !== "boolean") throw new Error("Låst skal være ja eller nej.");
      return { type, date, locked: raw.locked, label: `${raw.locked ? "Lås" : "Lås op"} ${dayName(date)}` };
    }
    case "addShoppingExtra": {
      const item = str(raw.item ?? raw.label, "Varenavn", { min: 1, max: 100 });
      return { type, item, label: `Tilføj «${item}» til indkøbslisten` };
    }
    case "addFridgeItem": {
      const name = str(raw.name, "Varenavn", { min: 1, max: 100 });
      const quantity = optStr(raw.quantity, "Mængde", 60);
      const expiresOn = raw.expiresOn === undefined || raw.expiresOn === null ? undefined : dateField(raw.expiresOn, "Udløbsdatoen");
      const detail = quantity ? ` (${quantity})` : "";
      return {
        type, name, ...(quantity ? { quantity } : {}), ...(expiresOn ? { expiresOn } : {}),
        label: `Læg «${name}»${detail} i køleskabet`,
      };
    }
    case "removeFridgeItem": {
      const name = str(raw.name, "Varenavn", { min: 1, max: 100 });
      return { type, name, label: `Fjern «${name}» fra køleskabet` };
    }
    case "removeShoppingExtra": {
      const item = str(raw.item, "Varenavn", { min: 1, max: 100 });
      return { type, item, label: `Fjern «${item}» fra indkøbslisten` };
    }
    case "setMealNote": {
      const date = dateField(raw.date, "Datoen");
      const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 300) : "";
      return {
        type, date, note,
        label: note ? `Skriv note på ${dayName(date)}: «${note}»` : `Fjern noten på ${dayName(date)}`,
      };
    }
    case "skipMeal": {
      const date = dateField(raw.date, "Datoen");
      const skipped = raw.skipped !== false;
      return {
        type, date, skipped,
        label: skipped ? `Marker ${dayName(date)} som «ikke spist» (${mealName(env, date)})` : `Fortryd «ikke spist» på ${dayName(date)}`,
      };
    }
    case "rateMeal": {
      const date = dateField(raw.date, "Datoen");
      const rating = raw.rating === null ? null : oneOf(raw.rating, "Bedømmelse", ["up", "down", "never"] as const);
      const verdict = rating === null ? "Fjern bedømmelsen af" : { up: "Godt:", down: "Ikke så godt:", never: "Aldrig igen:" }[rating];
      return { type, date, rating, label: `${verdict} ${mealName(env, date)} (${dayName(date)})` };
    }
    case "addGlobalExclusion": {
      const term = str(raw.term, "Fravalg", { min: 2, max: 80 });
      return { type, term, label: `Fravælg «${term}» for hele familien` };
    }
    case "updateProfile": {
      const profileId = str(raw.profileId, "Person", { min: 1, max: 200 });
      const profile = env.profiles.find((entry) => entry.id === profileId);
      if (!profile) throw new Error("Personen findes ikke.");
      const field = oneOf(raw.field, "Felt", ["preferences", "dislikes", "exclusions"] as const);
      const term = str(raw.term, "Ord", { min: 2, max: 80 });
      const remove = raw.remove === true;
      const what = { preferences: "kan lide", dislikes: "kan ikke lide", exclusions: "må/vil ikke have (fravalg)" }[field];
      return {
        type, profileId, field, term, remove,
        label: remove ? `Fjern «${term}» fra ${profile.name}: ${what}` : `Husk: ${profile.name} ${what} «${term}»`,
      };
    }
    case "createDish": {
      const dish = dishInput(raw.dish);
      return { type, dish, label: `Opret ny ret: «${dish.name}»` };
    }
    case "startPlanDraft": {
      const input = isRec(raw.request) ? raw.request : {};
      const request: PlanRequest = planRequest({
        engine: env.aiAvailable ? "ai" : "local",
        from: env.today,
        dayCount: 7,
        skippedDates: [],
        newDishCount: 0,
        requiredDishIds: [],
        request: "",
        dayRequests: {},
        ...input,
      });
      return { type, request, label: `Lav et planudkast for ${request.dayCount} dage fra ${dayName(request.from)}` };
    }
  }
}

/** Danish reason why the action may not run right now, or null when it is fine. */
export function checkAction(env: ActionEnv, action: AssistAction): string | null {
  const past = (date: string): boolean => date < env.today;
  const global = env.settings.globalExclusions;
  switch (action.type) {
    case "setMeal": {
      if (past(action.date)) return "Dagen ligger i fortiden.";
      const dish = env.dish(action.dishId);
      if (!dish || dish.archivedAt) return "Retten findes ikke eller er arkiveret.";
      const reasons = dishConflictReasons(dish, global, env.profiles);
      if (reasons.length > 0) return `Retten er fravalgt (${reasons.join(", ")}).`;
      return env.meal(action.date)?.locked ? LOCKED_MESSAGE : null;
    }
    case "removeMeal": {
      const meal = env.meal(action.date);
      if (past(action.date)) return "Dagen ligger i fortiden.";
      if (!meal) return "Der er ikke planlagt noget den dag.";
      return meal.locked ? LOCKED_MESSAGE : null;
    }
    case "swapMeals": {
      if (action.a === action.b) return "Vælg to forskellige dage.";
      if (past(action.a) || past(action.b)) return "Dagen ligger i fortiden.";
      const first = env.meal(action.a);
      const second = env.meal(action.b);
      if (!first && !second) return "Ingen af dagene har en planlagt ret.";
      return first?.locked || second?.locked ? LOCKED_MESSAGE : null;
    }
    case "lockMeal":
      return env.meal(action.date) ? null : "Der er ikke planlagt noget den dag.";
    case "addShoppingExtra":
      return env.extras.some((extra) => extraItemId(extra.label) === extraItemId(action.item))
        ? "Står allerede på listen."
        : null;
    case "removeShoppingExtra":
      return env.extras.some((extra) => extraItemId(extra.label) === extraItemId(action.item))
        ? null
        : "Står ikke på listen som ekstra vare.";
    case "setMealNote":
      if (past(action.date)) return "Dagen ligger i fortiden.";
      return env.meal(action.date) ? null : "Der er ikke planlagt noget den dag.";
    case "skipMeal": {
      const meal = env.meal(action.date);
      if (!meal) return "Der er ikke planlagt noget den dag.";
      return (meal.skipped === true) === action.skipped ? "Står allerede sådan." : null;
    }
    case "rateMeal": {
      const meal = env.meal(action.date);
      if (!meal) return "Der var ikke planlagt noget den dag.";
      if (action.date > env.today) return "I kan først bedømme retten, når I har spist den.";
      if (meal.skipped) return "Dagen er markeret som ikke spist.";
      return (meal.rating ?? null) === action.rating ? "Står allerede sådan." : null;
    }
    case "addFridgeItem":
      return env.fridge.length >= 300 ? "Køleskabet er fyldt op." : null;
    case "removeFridgeItem":
      return env.fridge.some((item) => sameName(item.name, action.name)) ? null : "Varen ligger ikke i køleskabet.";
    case "addGlobalExclusion": {
      const [term] = parseExclusionTerms([action.term]);
      if (!term) return "Fravalget er for kort.";
      return parseExclusionTerms(global).includes(term) ? "Er allerede fravalgt." : null;
    }
    case "updateProfile": {
      const profile = env.profiles.find((entry) => entry.id === action.profileId);
      if (!profile) return "Personen findes ikke.";
      const has = profile[action.field].some((entry) => sameName(entry, action.term));
      if (action.remove) return has ? null : "Står der ikke.";
      if (has) return "Står der allerede.";
      return profile[action.field].length >= 30 ? "Listen er fuld." : null;
    }
    case "createDish": {
      if (!dishAllowed(action.dish, global, env.profiles)) {
        return `Retten indeholder fravalgte ting (${dishConflictReasons(action.dish, global, env.profiles).join(", ")}).`;
      }
      return null;
    }
    case "startPlanDraft":
      return action.request.engine === "ai" && !env.aiAvailable ? "AI-planlægning er ikke sat op." : null;
  }
}

export type ParsedActions = { actions: AssistAction[]; dropped: string[] };

/** Keeps only well-formed, currently allowed actions (at most MAX_ACTIONS); the rest are reported in `dropped`. */
export function parseAssistActions(raw: unknown, env: ActionEnv): ParsedActions {
  const actions: AssistAction[] = [];
  const dropped: string[] = [];
  const entries = Array.isArray(raw) ? raw : [];
  for (const entry of entries.slice(0, MAX_ACTIONS)) {
    try {
      const action = parseAction(entry, env);
      const problem = checkAction(env, action);
      if (problem) dropped.push(`${action.label}: ${problem}`);
      else actions.push(action);
    } catch (error) {
      dropped.push(error instanceof Error ? error.message : "Ugyldig handling.");
    }
  }
  if (entries.length > MAX_ACTIONS) dropped.push(`${entries.length - MAX_ACTIONS} handlinger ud over grænsen på ${MAX_ACTIONS}.`);
  return { actions, dropped };
}
