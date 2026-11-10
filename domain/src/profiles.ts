import type { Dish, Profile } from "./types.ts";

/** Inactive profiles do not count towards planning, exclusions or portions. */
export const participatingProfiles = (profiles: readonly Profile[]): Profile[] =>
  profiles.filter((profile) => profile.active);

export function profileServings(profiles: readonly Profile[]): number {
  const selected = participatingProfiles(profiles);
  if (!selected.length) return 4;
  return selected.reduce(
    (total, profile) =>
      total +
      (typeof profile.portions === "number" &&
      Number.isFinite(profile.portions) &&
      profile.portions >= 0.5 &&
      profile.portions <= 8
        ? profile.portions
        : 1),
    0,
  );
}

const lower = (value: string): string => value.normalize("NFKC").toLocaleLowerCase("da-DK");

const terms = (raw: readonly string[]): string[] =>
  raw.map((term) => lower(term).trim()).filter((term) => term.length >= 2);

/** Normalize free-form profile input into stable, unique preference tokens. */
export function normalizeProfileTerms(input: string | readonly string[], limit = 30): string[] {
  const values = typeof input === "string" ? input.split(/[,;\n]+/u) : input;
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const clean = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
    const key = clean.toLocaleLowerCase("da-DK");
    if (clean.length < 2 || seen.has(key)) continue;
    seen.add(key);
    normalized.push(clean);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

const matched = (text: string, values: readonly string[]): number =>
  terms(values).filter((value) => text.includes(value)).length;

/**
 * Equal consideration for each participating profile; a dislike is a strong soft penalty.
 * Hard exclusions are handled separately (see exclusions.ts).
 */
export function preferenceScore(
  dish: Pick<Dish, "id" | "name" | "category" | "ingredients">,
  profiles: readonly Profile[],
): number {
  const members = participatingProfiles(profiles);
  if (!members.length) return 0;
  const content = lower([dish.name, dish.category, ...dish.ingredients].join(" "));
  let sum = 0;
  for (const member of members) {
    const positive = Math.min(2, matched(content, member.preferences));
    const negative = Math.min(2, matched(content, member.dislikes));
    const favorite = member.favoriteDishIds.includes(dish.id) ? 1 : 0;
    sum += Math.max(-25, Math.min(25, positive * 8 + favorite * 18 - negative * 18));
  }
  return Math.round(sum / members.length);
}

export function toggleProfileFavorite(profile: Profile, dishId: string): Profile {
  const favorites = profile.favoriteDishIds;
  return {
    ...profile,
    favoriteDishIds: favorites.includes(dishId)
      ? favorites.filter((id) => id !== dishId)
      : [...favorites.filter((id) => id !== dishId), dishId].slice(0, 150),
  };
}
