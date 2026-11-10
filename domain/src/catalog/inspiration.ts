import type { InspirationRecipe } from "../types.ts";
import { BUNDLED_IMAGE_RECIPES } from "./inspiration-bundled.ts";
import { LINK_ONLY_RECIPES } from "./inspiration-links.ts";

export { INSPIRATION_CUISINES } from "../types.ts";
export type { InspirationCuisine, InspirationRecipe } from "../types.ts";

/** Curated inspiration catalog. Recipes link to the original source; photos are referenced by imageKey. */
export const INSPIRATION_RECIPES: readonly InspirationRecipe[] = [
  ...BUNDLED_IMAGE_RECIPES,
  ...LINK_ONLY_RECIPES,
];
