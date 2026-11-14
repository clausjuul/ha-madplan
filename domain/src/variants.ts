/**
 * Variants: one person gets one part of the dish swapped for something they always eat,
 * e.g. nuggets instead of the steak, while the rest of the dish stays the same.
 * It is an option the planner may use, never a rule.
 */
import { parseExclusionTerms } from "./exclusions.ts";
import { ingredientsMatch, normalizeItem, parseIngredient } from "./ingredients.ts";
import type { Dish, MealVariant, Profile } from "./types.ts";

type VariantDish = Pick<Dish, "ingredients">;

const participatingProfiles = (profiles: readonly Profile[]): Profile[] =>
  profiles.filter((profile) => profile.active);

const lower = (value: string): string => value.normalize("NFKC").toLocaleLowerCase("da-DK").trim();

/** At most this many days of a plan get a variant, so it does not turn into two dinners every day. */
export function maxVariantDays(dayCount: number): number {
  return Math.max(1, Math.floor(dayCount / 3));
}

/** Portions a variant takes from the main dish (the profile's own portion size, default 1). */
export function variantPortions(variant: Pick<MealVariant, "profileId">, profiles: readonly Profile[]): number {
  const portions = profiles.find((profile) => profile.id === variant.profileId)?.portions;
  return typeof portions === "number" && Number.isFinite(portions) && portions >= 0.5 && portions <= 8 ? portions : 1;
}

/** "bøf" in "bøffer" or "oksebøf": the term starts or ends a word (same idea as containsTerm). */
function atWordEdge(text: string, term: string): boolean {
  if (term.length < 3) return text.split(/[^\p{L}\p{N}]+/u).includes(term);
  return text.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(term) || word.endsWith(term));
}

/** The dish's ingredient (its parsed name) that `term` refers to, if any. */
export function matchIngredient(dish: VariantDish, term: string): string | undefined {
  const wanted = lower(term);
  if (wanted.length < 2) return undefined;
  for (const ingredient of dish.ingredients) {
    const name = parseIngredient(ingredient).name;
    if (ingredientsMatch(name, wanted) || atWordEdge(lower(name), wanted)) return name;
  }
  return undefined;
}

/** The profile's safe food that `term` refers to, spelled as on the profile. */
function matchSafeFood(profile: Profile, term: string): string | undefined {
  const wanted = normalizeItem(term);
  return (profile.safeFoods ?? []).find(
    (food) => normalizeItem(food) === wanted || ingredientsMatch(food, wanted),
  );
}

function violatesExclusions(food: string, profile: Profile, globalExclusions: readonly string[]): boolean {
  const content = lower(food);
  return parseExclusionTerms([...globalExclusions, ...profile.exclusions]).some((term) => content.includes(term));
}

/**
 * Keeps only usable variants from untrusted input (an AI answer or an API body): an active profile,
 * a replacement from that profile's safe foods that breaks no exclusion, a part that really is in
 * the dish (stored as the ingredient's own name) and one variant per profile.
 */
export function normalizeVariants(
  raw: unknown,
  dish: VariantDish,
  profiles: readonly Profile[],
  globalExclusions: readonly string[] = [],
): MealVariant[] {
  if (!Array.isArray(raw)) return [];
  const members = participatingProfiles(profiles);
  const result: MealVariant[] = [];
  for (const item of raw.slice(0, 10)) {
    if (item === null || typeof item !== "object") continue;
    const { profileId, replaces, with: replacement } = item as Record<string, unknown>;
    if (typeof profileId !== "string" || typeof replaces !== "string" || typeof replacement !== "string") continue;
    const profile = members.find((member) => member.id === profileId);
    if (!profile || result.some((variant) => variant.profileId === profileId)) continue;
    const safe = matchSafeFood(profile, replacement);
    const part = matchIngredient(dish, replaces);
    if (!safe || !part || ingredientsMatch(safe, part)) continue;
    if (violatesExclusions(safe, profile, globalExclusions)) continue;
    result.push({ profileId, replaces: part, with: safe });
  }
  return result;
}

/**
 * A variant the family would probably want: a profile with safe foods dislikes an ingredient of the
 * dish, so that ingredient is swapped for their first allowed safe food. Empty when none fits.
 */
export function suggestVariants(
  dish: VariantDish,
  profiles: readonly Profile[],
  globalExclusions: readonly string[] = [],
): MealVariant[] {
  const result: MealVariant[] = [];
  for (const profile of participatingProfiles(profiles)) {
    if (!profile.safeFoods?.length) continue;
    const part = profile.dislikes.map((dislike) => matchIngredient(dish, dislike)).find(Boolean);
    if (!part) continue;
    const safe = profile.safeFoods.find(
      (food) => !violatesExclusions(food, profile, globalExclusions) && !ingredientsMatch(food, part),
    );
    if (safe) result.push({ profileId: profile.id, replaces: part, with: safe });
  }
  return result;
}

/** Whether a profile's dislike of this dish could be solved with a variant. */
export function swappableDislike(dish: VariantDish, profile: Profile, dislike: string): boolean {
  return Boolean(profile.safeFoods?.length) && matchIngredient(dish, dislike) !== undefined;
}

/** "Oliver: nuggets i stedet for bøf". */
export function describeVariant(variant: MealVariant, profiles: readonly Profile[]): string {
  const name = profiles.find((profile) => profile.id === variant.profileId)?.name ?? "En af jer";
  return `${name}: ${variant.with} i stedet for ${variant.replaces}`;
}
