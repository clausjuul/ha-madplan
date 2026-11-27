/**
 * Finds a photo for a dish: the model web-searches for recipe pages, and the server reads the photo from
 * the page's own recipe data. The model never hands us an image URL directly, so every photo comes from a
 * public HTTPS recipe page that we fetched and parsed ourselves.
 */
import { AiError, extractJsonObject } from "./openai.ts";
import type { OpenAiClient } from "./openai.ts";
import { FENCE_RULE, fenced, newFence } from "./prompt.ts";
import { assertPublicHttpsUrl, importRecipeFromUrl } from "./recipe-import.ts";

const MAX_PAGES = 6;
/** Photos offered to choose from in the dish form. */
export const MAX_SUGGESTIONS = 3;

export type FoundImage = { imageUrl: string; sourceUrl: string };

function imagePrompt(dishName: string, fence = newFence()) {
  return {
    instructions: [
      "Du finder opskriftssider på nettet med et godt foto af en bestemt ret.",
      "Søg på nettet. Vælg sider, der er én konkret opskrift på netop den ret (ikke samlesider, videoer eller billedbanker), helst danske.",
      `Svar med ét JSON-objekt: {"pages":["https://..."]} med op til ${MAX_PAGES} direkte links til opskriftssider. Opfind aldrig links.`,
      FENCE_RULE(fence),
    ].join("\n\n"),
    input: `${fenced("Retten:", dishName.slice(0, 130), fence)}\n\nSvar med JSON.`,
  };
}

/** The photo in one page's recipe data, or null when the page cannot be read or has none. */
async function photoOn(page: string, fetcher: typeof fetch, signal?: AbortSignal): Promise<FoundImage | null> {
  try {
    const recipe = await importRecipeFromUrl(page, fetcher, signal);
    if (!recipe.imageUrl) return null;
    return { imageUrl: assertPublicHttpsUrl(recipe.imageUrl).href, sourceUrl: recipe.sourceUrl ?? page };
  } catch {
    return null;
  }
}

/**
 * Up to `max` photos from different recipe pages, in the order the search ranked them (the pages are
 * read at the same time). Empty when nothing usable was found; throws AiError only when the AI call fails.
 */
export async function findDishImages(
  client: OpenAiClient,
  model: string,
  fetcher: typeof fetch,
  dishName: string,
  signal?: AbortSignal,
  max = MAX_SUGGESTIONS,
): Promise<FoundImage[]> {
  const answer = await client.respond({ model, ...imagePrompt(dishName), webSearch: true, signal });
  const parsed = extractJsonObject(answer.text) as { pages?: unknown } | undefined;
  const pages = Array.isArray(parsed?.pages)
    ? [...new Set(parsed.pages.filter((page): page is string => typeof page === "string"))].slice(0, MAX_PAGES)
    : [];
  const found = await Promise.all(pages.map((page) => photoOn(page, fetcher, signal)));
  const seen = new Set<string>();
  return found
    .filter((image): image is FoundImage => image !== null && !seen.has(image.imageUrl) && Boolean(seen.add(image.imageUrl)))
    .slice(0, max);
}

/** Null when nothing usable was found. Throws AiError only when the AI call itself fails. */
export async function findDishImage(
  client: OpenAiClient,
  model: string,
  fetcher: typeof fetch,
  dishName: string,
  signal?: AbortSignal,
): Promise<FoundImage | null> {
  return (await findDishImages(client, model, fetcher, dishName, signal, 1))[0] ?? null;
}
