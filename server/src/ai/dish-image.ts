/**
 * Finds a photo for a dish: the model web-searches for recipe pages, and the server reads the photo from
 * the page's own recipe data. The model never hands us an image URL directly, so every photo comes from a
 * public HTTPS recipe page that we fetched and parsed ourselves.
 */
import { AiError, extractJsonObject } from "./openai.ts";
import type { OpenAiClient } from "./openai.ts";
import { FENCE_RULE, fenced, newFence } from "./prompt.ts";
import { assertPublicHttpsUrl, importRecipeFromUrl } from "./recipe-import.ts";

const MAX_PAGES = 4;

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

/** Null when nothing usable was found. Throws AiError only when the AI call itself fails. */
export async function findDishImage(
  client: OpenAiClient,
  model: string,
  fetcher: typeof fetch,
  dishName: string,
  signal?: AbortSignal,
): Promise<FoundImage | null> {
  const answer = await client.respond({ model, ...imagePrompt(dishName), webSearch: true, signal });
  const parsed = extractJsonObject(answer.text) as { pages?: unknown } | undefined;
  const pages = Array.isArray(parsed?.pages)
    ? parsed.pages.filter((page): page is string => typeof page === "string").slice(0, MAX_PAGES)
    : [];
  for (const page of pages) {
    try {
      const recipe = await importRecipeFromUrl(page, fetcher, signal);
      if (!recipe.imageUrl) continue;
      const image = assertPublicHttpsUrl(recipe.imageUrl);
      return { imageUrl: image.href, sourceUrl: recipe.sourceUrl ?? page };
    } catch (error) {
      if (error instanceof AiError) throw error;
      // Page could not be read or had no recipe data: try the next one.
    }
  }
  return null;
}
