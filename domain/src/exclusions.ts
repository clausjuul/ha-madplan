import { participatingProfiles } from "./profiles.ts";
import type { Dish, Profile } from "./types.ts";

type DishContent = Pick<Dish, "name" | "category" | "ingredients">;

const normalize = (value: string): string =>
  value.trim().normalize("NFKC").toLocaleLowerCase("da-DK");

/** Splits comma/semicolon/newline separated input and drops terms shorter than 2 characters. */
export function parseExclusionTerms(input: string | readonly string[]): string[] {
  const values = typeof input === "string" ? input.split(/[,;\n]+/u) : input;
  return [...new Set(values.map(normalize).filter((term) => term.length >= 2))];
}

/** Hard exclusion terms: global ones plus those of every participating profile. */
export function foodExclusions(
  global: readonly string[],
  profiles: readonly Profile[],
): string[] {
  return parseExclusionTerms([
    ...global,
    ...participatingProfiles(profiles).flatMap((profile) => profile.exclusions),
  ]);
}

export function dishContent(dish: DishContent): string {
  return normalize([dish.name, dish.category, ...dish.ingredients].join(" "));
}

/** Danish explanations such as "Fælles: svampe" or "Emma: kylling". */
export function dishConflictReasons(
  dish: DishContent,
  global: readonly string[],
  profiles: readonly Profile[],
): string[] {
  const content = dishContent(dish);
  const reasons = parseExclusionTerms(global)
    .filter((term) => content.includes(term))
    .map((term) => `Fælles: ${term}`);
  for (const member of participatingProfiles(profiles)) {
    reasons.push(
      ...parseExclusionTerms(member.exclusions)
        .filter((term) => content.includes(term))
        .map((term) => `${member.name}: ${term}`),
    );
  }
  return [...new Set(reasons)];
}

export function dishAllowed(
  dish: DishContent,
  global: readonly string[],
  profiles: readonly Profile[],
): boolean {
  return dishConflictReasons(dish, global, profiles).length === 0;
}
