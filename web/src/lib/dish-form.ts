import type { Dish, DishInput } from "@madplan/domain";
import { parseLines } from "./chips";

/** Editable text-based state of the dish form. */
export type DishDraft = {
  name: string;
  category: string;
  prepMinutes: string;
  servings: string;
  imageUrl: string;
  ingredients: string;
  steps: string;
  sourceUrl: string;
  favorite: boolean;
  leftoverFriendly: boolean;
  freezerFriendly: boolean;
};

export type DishErrors = Partial<
  Record<"name" | "category" | "prepMinutes" | "servings" | "ingredients" | "sourceUrl", string>
>;

export const emptyDraft = (): DishDraft => ({
  name: "",
  category: "",
  prepMinutes: "30",
  servings: "",
  imageUrl: "",
  ingredients: "",
  steps: "",
  sourceUrl: "",
  favorite: false,
  leftoverFriendly: false,
  freezerFriendly: false,
});

/** Form state from a saved dish or from a preview (link, text, photo or AI). */
export const draftFromDish = (dish: DishInput): DishDraft => ({
  name: dish.name,
  category: dish.category,
  prepMinutes: String(dish.prepMinutes),
  servings: dish.servings ? String(dish.servings) : "",
  imageUrl: dish.imageUrl ?? "",
  ingredients: dish.ingredients.join("\n"),
  steps: (dish.instructions ?? []).join("\n"),
  sourceUrl: dish.sourceUrl ?? "",
  favorite: dish.favorite,
  leftoverFriendly: dish.leftoverFriendly,
  freezerFriendly: dish.freezerFriendly,
});

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export function validateDraft(draft: DishDraft): DishErrors {
  const errors: DishErrors = {};
  if (!draft.name.trim()) errors.name = "Giv retten et navn.";
  if (!draft.category.trim()) errors.category = "Vælg eller skriv en kategori.";
  const minutes = Number(draft.prepMinutes);
  if (!draft.prepMinutes.trim() || !Number.isFinite(minutes) || minutes < 1 || minutes > 600) {
    errors.prepMinutes = "Skriv tilberedningstid i minutter (1–600).";
  }
  if (draft.servings.trim()) {
    const servings = Number(draft.servings);
    if (!Number.isInteger(servings) || servings < 1 || servings > 50) {
      errors.servings = "Antal portioner skal være et helt tal mellem 1 og 50.";
    }
  }
  if (parseLines(draft.ingredients).length === 0) errors.ingredients = "Tilføj mindst én ingrediens.";
  if (draft.sourceUrl.trim() && !isHttpUrl(draft.sourceUrl.trim())) {
    errors.sourceUrl = "Linket skal starte med http:// eller https://.";
  }
  return errors;
}

/** Builds the API payload; keeps a bundled `imageKey` when the image was not replaced. */
export function draftToInput(draft: DishDraft, original?: Pick<DishInput, "imageKey" | "generated">): DishInput {
  const steps = parseLines(draft.steps);
  const imageUrl = draft.imageUrl.trim();
  const imageKey = original?.imageKey && !imageUrl ? original.imageKey : undefined;
  return {
    name: draft.name.trim(),
    category: draft.category.trim(),
    prepMinutes: Math.round(Number(draft.prepMinutes)),
    ingredients: parseLines(draft.ingredients),
    favorite: draft.favorite,
    leftoverFriendly: draft.leftoverFriendly,
    freezerFriendly: draft.freezerFriendly,
    ...(draft.servings.trim() ? { servings: Number(draft.servings) } : {}),
    ...(imageKey ? { imageKey } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(draft.sourceUrl.trim() ? { sourceUrl: draft.sourceUrl.trim() } : {}),
    ...(steps.length > 0 ? { instructions: steps } : {}),
    ...(original?.generated ? { generated: true } : {}),
  };
}

const DEFAULT_MINUTES = emptyDraft().prepMinutes;

/**
 * "Udfyld med AI": takes the AI's dish into the fields the user has not filled in yet. The name and
 * anything typed by hand stay; the minutes count as empty while they are still the default.
 */
export function fillEmpty(draft: DishDraft, dish: DishInput): DishDraft {
  const from = draftFromDish(dish);
  const empty = (value: string): boolean => value.trim() === "";
  return {
    ...draft,
    category: empty(draft.category) ? from.category : draft.category,
    prepMinutes: empty(draft.prepMinutes) || draft.prepMinutes === DEFAULT_MINUTES ? from.prepMinutes : draft.prepMinutes,
    servings: empty(draft.servings) ? from.servings : draft.servings,
    imageUrl: empty(draft.imageUrl) ? from.imageUrl : draft.imageUrl,
    ingredients: empty(draft.ingredients) ? from.ingredients : draft.ingredients,
    steps: empty(draft.steps) ? from.steps : draft.steps,
    sourceUrl: empty(draft.sourceUrl) ? from.sourceUrl : draft.sourceUrl,
    leftoverFriendly: draft.leftoverFriendly || from.leftoverFriendly,
    freezerFriendly: draft.freezerFriendly || from.freezerFriendly,
  };
}

/** True when the AI's dish would fill at least one field (so the button is worth showing as an action). */
export const hasEmptyFields = (draft: DishDraft): boolean =>
  [draft.category, draft.ingredients, draft.steps].some((value) => value.trim() === "");

const nameKey = (name: string): string =>
  name.trim().toLocaleLowerCase("da-DK").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Another dish with the same name (case, spaces and punctuation ignored), active ones first. */
export function findDuplicate(name: string, dishes: readonly Dish[], exceptId?: string): Dish | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  const same = dishes.filter((dish) => dish.id !== exceptId && nameKey(dish.name) === key);
  return same.find((dish) => !dish.archivedAt) ?? same[0];
}
