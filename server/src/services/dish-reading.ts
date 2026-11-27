/** Turns a link, text, photos or a dish name into a dish preview for the form. Nothing is saved here. */
import type { DishDraftInput, DishInput, DishPreview, DishReadInput, RecipeReview } from "@madplan/domain";
import { draftDish, readRecipe, type DishAiContext } from "../ai/dish-ai.ts";
import { fetchRecipePage, NO_RECIPE_DATA, pageImage, pageText, parseRecipeHtml, type ParsedRecipe } from "../ai/recipe-import.ts";
import { reviewRecipe } from "../ai/recipe-review.ts";
import type { Deps } from "../deps.ts";
import { unprocessable } from "../errors.ts";
import { allDishes } from "../store-dishes.ts";
import { getProfiles, getSettings } from "../store-household.ts";

type Reading = { recipe: ParsedRecipe; how: DishPreview["how"]; review?: RecipeReview };

export function dishAiContext(deps: Pick<Deps, "repo">): DishAiContext {
  const { db } = deps.repo;
  const categories = [...new Set(allDishes(db).filter((dish) => !dish.archivedAt).map((dish) => dish.category))];
  const people = getProfiles(db).length;
  return { categories, servings: getSettings(db).preferredServings ?? (people > 0 ? people : 4) };
}

/**
 * A recipe page: its structured data when it has some (checked by the recipe check when `review` is
 * set), otherwise the page's text read by AI. Without OpenAI a page without structured data is refused.
 */
export async function recipeFromUrl(
  deps: Pick<Deps, "repo" | "openai" | "config" | "fetch">,
  url: string,
  options: { review: boolean; signal?: AbortSignal },
): Promise<Reading> {
  const page = await fetchRecipePage(url, deps.fetch, options.signal);
  const structured = parseRecipeHtml(page.html, page.url);
  if (structured) {
    if (!options.review) return { recipe: structured, how: "structured" };
    const { recipe, review } = await reviewRecipe(deps.openai, deps.config.planModel, structured, options.signal);
    return { recipe, how: "structured", review };
  }
  const text = pageText(page.html);
  if (!deps.openai.configured || text.length < 80) throw unprocessable(NO_RECIPE_DATA);
  const read = await readRecipe(deps.openai, deps.config.planModel, { text }, dishAiContext(deps), options.signal);
  const image = pageImage(page.html);
  return { recipe: { ...read, sourceUrl: page.url, ...(image ? { imageUrl: image } : {}) }, how: "read" };
}

const toInput = ({ custom: _custom, archivedAt: _archived, ...dish }: ParsedRecipe): DishInput => dish;

const preview = ({ recipe, how, review }: Reading): DishPreview => ({ dish: toInput(recipe), how, ...(review ? { review } : {}) });

export async function readDish(
  deps: Pick<Deps, "repo" | "openai" | "config" | "fetch">,
  input: DishReadInput,
  signal?: AbortSignal,
): Promise<DishPreview> {
  if ("url" in input) return preview(await recipeFromUrl(deps, input.url, { review: true, signal }));
  const source = "text" in input ? { text: input.text } : { images: input.images };
  const recipe = await readRecipe(deps.openai, deps.config.planModel, source, dishAiContext(deps), signal);
  return preview({ recipe, how: "read" });
}

export async function draftDishPreview(
  deps: Pick<Deps, "repo" | "openai" | "config">,
  input: DishDraftInput,
  signal?: AbortSignal,
): Promise<DishPreview> {
  const recipe = await draftDish(deps.openai, deps.config.planModel, input, dishAiContext(deps), signal);
  return preview({ recipe, how: "drafted" });
}
