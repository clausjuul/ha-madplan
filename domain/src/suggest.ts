/** Local (non-AI) suggestions. Deterministic: the same inputs and seed always give the same plan. */
import { DISHES } from "./catalog/dishes.ts";
import { daysBetween, isDateKey, parseDateKey } from "./dates.ts";
import { dishContent, parseExclusionTerms } from "./exclusions.ts";
import { participatingProfiles, preferenceScore } from "./profiles.ts";
import type { DraftDay, Dish, FridgeItem, MealMap, Profile } from "./types.ts";

export type SuggestionInput = {
  /** Date keys to fill, ascending. */
  days: readonly string[];
  meals: MealMap;
  fridge: readonly FridgeItem[];
  /** dishId -> date last eaten (see lastEatenByDish). */
  lastEaten: ReadonlyMap<string, string>;
  /** Replaces Math.random: change it to get a different but reproducible plan. */
  seed: number;
  dishes?: readonly Dish[];
  requiredDishIds?: readonly string[];
  userRequest?: string;
  dayRequests?: Readonly<Record<string, string>>;
  globalExclusions?: readonly string[];
  profiles?: readonly Profile[];
};

const FRIDAY = 5;

export function createLocalSuggestions(input: SuggestionInput): DraftDay[] {
  const {
    days,
    meals,
    fridge,
    lastEaten,
    seed,
    requiredDishIds = [],
    dayRequests = {},
    globalExclusions = [],
  } = input;
  const profiles = participatingProfiles(input.profiles ?? []);
  const dishes = (input.dishes ?? DISHES).filter((dish) => !dish.archivedAt);
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
  const usedDishIds = new Set<string>();
  const usedCategories = new Map<string, number>();
  const request = normalize(input.userRequest ?? "");
  const requestTerms = requestTermsOf(request);
  const exclusionTerms = parseExclusionTerms([
    ...globalExclusions,
    ...profiles.flatMap((profile) => profile.exclusions),
  ]);
  const wantsSomethingNew =
    /(?:noget nyt|ny ret|ikke (?:har )?fået før|aldrig fået)/u.test(request);
  const conflicts = (dish: Dish): boolean => {
    const content = dishContent(dish);
    return exclusionTerms.some((term) => content.includes(term));
  };
  const count = (category: string): void => {
    usedCategories.set(category, (usedCategories.get(category) ?? 0) + 1);
  };

  for (const day of days) {
    const existing = meals[day];
    if (!existing?.locked) continue;
    usedDishIds.add(existing.dishId);
    const category = dishById.get(existing.dishId)?.category;
    if (category) count(category);
  }

  const requiredQueue = requiredDishIds.filter(
    (id, index) => dishById.has(id) && !usedDishIds.has(id) && requiredDishIds.indexOf(id) === index,
  );

  return days.flatMap((day): DraftDay[] => {
    if (meals[day]?.locked) return [];
    const dayRequest = normalize(dayRequests[day] ?? "");
    const dayTerms = requestTermsOf(dayRequest);
    const wantsQuick = /\b(?:hurtig|hurtigt|nem|travl)\b/u.test(dayRequest);
    const wantsLeftovers = /\b(?:rest|rester|restemad)\b/u.test(dayRequest);

    // Required recipes must obey exclusions too, including those selected in the UI.
    const requiredId = requiredQueue.find((id) => {
      const dish = dishById.get(id);
      return dish !== undefined && !conflicts(dish);
    });
    const required = requiredId ? dishById.get(requiredId) : undefined;
    if (requiredId && required) {
      requiredQueue.splice(requiredQueue.indexOf(requiredId), 1);
      usedDishIds.add(required.id);
      count(required.category);
      return [
        {
          date: day,
          dishId: required.id,
          reason: "Valgt på forhånd til denne uge.",
          locked: false,
          source: "local",
        },
      ];
    }

    const weekday = parseDateKey(day).getDay();
    const ranked = dishes
      // Exclusions are mandatory, not merely a ranking penalty.
      .filter((dish) => !conflicts(dish))
      .map((dish) => {
        const content = normalize([dish.name, dish.category, ...dish.ingredients].join(" "));
        const matches = matchingFridgeItems(dish.ingredients, fridge, day);
        const last = lastEaten.get(dish.id);
        const recencyScore = last ? Math.min(36, Math.max(0, daysBetween(last, day)) * 0.7) : 32;
        const requestMatchCount = requestTerms.filter((term) => containsTerm(content, term)).length;
        const dayMatchCount = dayTerms.filter((term) => containsTerm(content, term)).length;
        const fridayTreat =
          weekday === FRIDAY &&
          request.includes("fredag") &&
          /(?:ekstra god|lidt ekstra|lækker|forkæl)/u.test(request);
        const requestScore =
          requestMatchCount * 22 +
          dayMatchCount * 34 +
          (wantsQuick ? (dish.prepMinutes <= 30 ? 34 : -18) : 0) +
          (wantsLeftovers && dish.leftoverFriendly ? 36 : 0) +
          (wantsSomethingNew && !last ? 24 : 0) +
          (fridayTreat && dish.favorite ? 18 : 0) +
          (fridayTreat && dish.prepMinutes >= 35 ? 5 : 0);
        const score =
          matches.reduce((total, match) => total + fridgeMatchScore(match), 0) +
          recencyScore +
          (dish.favorite ? 7 : 0) +
          (dish.leftoverFriendly ? 3 : 0) +
          (hash(`${dish.id}:${day}:${seed}`) % 13) -
          (usedDishIds.has(dish.id) ? 1_000 : 0) -
          (usedCategories.get(dish.category) ?? 0) * 14 +
          requestScore +
          preferenceScore(dish, profiles);
        return {
          dish,
          matches,
          last,
          score,
          requestMatched: requestMatchCount > 0 || (wantsSomethingNew && !last) || fridayTreat,
          dayRequestMatched:
            dayMatchCount > 0 ||
            (wantsQuick && dish.prepMinutes <= 30) ||
            (wantsLeftovers && dish.leftoverFriendly),
        };
      })
      .sort((a, b) => b.score - a.score);

    const winner = ranked[0];
    if (!winner) return [];
    usedDishIds.add(winner.dish.id);
    count(winner.dish.category);
    return [
      {
        date: day,
        dishId: winner.dish.id,
        reason: buildReason(winner.matches, winner.last, day, winner.requestMatched, winner.dayRequestMatched),
        locked: false,
        source: "local",
      },
    ];
  });
}

export type FridgeMatch = {
  name: string;
  /** Days from the planned day until the item expires (negative: already expired), when known. */
  daysLeft?: number;
  useFirst: boolean;
};

/** Fridge items used by a dish. Soon-to-expire and "brug først" items sort first. */
export function matchingFridgeItems(
  ingredients: readonly string[],
  fridge: readonly FridgeItem[],
  day?: string,
): FridgeMatch[] {
  return fridge
    .filter((item) => {
      const name = normalize(item.name);
      if (!name) return false;
      return ingredients.some((ingredient) => {
        const normalized = normalize(ingredient);
        return normalized !== "" && (containsTerm(normalized, name) || containsTerm(name, normalized));
      });
    })
    .map((item): FridgeMatch => ({
      name: item.name,
      ...(item.expiresOn && day && isDateKey(item.expiresOn)
        ? { daysLeft: daysBetween(day, item.expiresOn) }
        : {}),
      useFirst: item.useFirst === true,
    }))
    .sort((a, b) => fridgeMatchScore(b) - fridgeMatchScore(a));
}

/** Using an item that expires soon (or is marked "brug først") is worth much more than any fridge match. */
export function fridgeMatchScore(match: FridgeMatch): number {
  const { daysLeft } = match;
  const urgency =
    daysLeft === undefined || daysLeft < 0 ? 0 : daysLeft <= 2 ? 30 : daysLeft <= 5 ? 12 : 0;
  return 18 + urgency + (match.useFirst ? 15 : 0);
}

/**
 * Whether `term` occurs in `text` at the start or end of a word. Danish compounds still match
 * ("ost" in "flødeost", "ris" in "basmatiris") but word middles do not ("ost" in "rostbøf").
 */
export function containsTerm(text: string, term: string): boolean {
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}|${escaped}(?![\\p{L}\\p{N}])`, "u").test(text);
}

function expiryText(daysLeft: number): string {
  if (daysLeft <= 0) return "udløber i dag";
  if (daysLeft === 1) return "udløber i morgen";
  return `udløber om ${daysLeft} dage`;
}

function buildReason(
  matches: readonly FridgeMatch[],
  lastEaten: string | undefined,
  date: string,
  requestMatched: boolean,
  dayRequestMatched: boolean,
): string {
  if (dayRequestMatched) return "Matcher ønsket til denne dag.";
  if (requestMatched) return "Matcher ønsket, du skrev til madplanen.";
  const urgent = matches.find((match) => match.daysLeft !== undefined && match.daysLeft >= 0 && match.daysLeft <= 5);
  if (urgent?.daysLeft !== undefined) return `Bruger ${urgent.name}, der ${expiryText(urgent.daysLeft)}.`;
  if (matches.length > 0) return `Bruger ${matches.slice(0, 2).map((match) => match.name).join(" og ")} fra køleskabet.`;
  if (lastEaten) return `Ikke spist i ${Math.max(1, daysBetween(lastEaten, date))} dage.`;
  return "Giver variation i ugens retter.";
}

const IGNORED_REQUEST_WORDS = new Set([
  "gerne", "noget", "lidt", "ekstra", "ikke", "fået", "før", "skal", "være", "mad", "ret",
  "retten", "med", "til", "har", "lyst", "fredag", "fredagen",
]);

function requestTermsOf(request: string): string[] {
  return [...new Set(request.split(/[^a-zæøå0-9]+/u))].filter(
    (term) => term.length >= 3 && !IGNORED_REQUEST_WORDS.has(term),
  );
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("da-DK").replace(/^\d+[\s.,]*/u, "").trim();
}

function hash(value: string): number {
  let result = 0;
  for (const character of value) {
    result = (result * 31 + character.charCodeAt(0)) >>> 0;
  }
  return result;
}
