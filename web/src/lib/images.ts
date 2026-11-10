import type { Dish } from "@madplan/domain";

/** Bundled inspiration photo (relative to the base) or the recipe's own image URL. */
export function inspirationImageSrc(recipe: { imageKey?: string; imageUrl?: string }): string | undefined {
  if (recipe.imageKey) return `images/inspiration/${recipe.imageKey}.jpg`;
  return recipe.imageUrl || undefined;
}

/** Bundled photo (imageKey, relative to the base so Ingress prefixes work) or the dish's own imageUrl. */
export function dishImageSrc(dish: Pick<Dish, "imageKey" | "imageUrl">): string | undefined {
  if (dish.imageKey) return `images/dishes/${dish.imageKey}.jpg`;
  return dish.imageUrl || undefined;
}
