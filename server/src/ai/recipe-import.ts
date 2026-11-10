/** Imports a dish from the schema.org Recipe JSON-LD of a web page. Never invents missing data. */
import type { Dish } from "@madplan/domain";
import { unprocessable } from "../errors.ts";

const MAX_HTML = 2_000_000;
const MAX_REDIRECTS = 3;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function recipeNode(value: unknown): Json | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = recipeNode(entry);
      if (found) return found;
    }
    return undefined;
  }
  if (!isObject(value)) return undefined;
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  if (types.some((type) => typeof type === "string" && /(^|\/)Recipe$/iu.test(type))) return value;
  return recipeNode(value["@graph"]) ?? recipeNode(value.mainEntity) ?? recipeNode(value.itemListElement);
}

function steps(value: unknown): string[] {
  if (typeof value === "string") return value.split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  if (!Array.isArray(value)) return isObject(value) ? steps([value]) : [];
  return value
    .flatMap((item): string[] => {
      if (typeof item === "string") return [item.trim()];
      if (!isObject(item)) return [];
      if (typeof item.text === "string") return [item.text.trim()];
      if (typeof item.name === "string" && item["@type"] === "HowToStep") return [item.name.trim()];
      return steps(item.itemListElement);
    })
    .filter(Boolean);
}

function minutes(value: unknown, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const match = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?/iu.exec(value);
  if (!match) return fallback;
  const total = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  return total > 0 ? Math.min(240, Math.max(10, total)) : fallback;
}

function imageOf(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return imageOf(value[0]);
  if (isObject(value) && typeof value.url === "string") return value.url;
  return undefined;
}

export type ParsedRecipe = Omit<Dish, "id">;

export function parseRecipeHtml(html: string, sourceUrl: string): ParsedRecipe | null {
  const blocks = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/giu,
  );
  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse((block[1] ?? "").trim());
    } catch {
      continue;
    }
    const node = recipeNode(data);
    if (!node) continue;
    const ingredients = Array.isArray(node.recipeIngredient)
      ? node.recipeIngredient
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .slice(0, 100)
      : [];
    const instructions = steps(node.recipeInstructions).slice(0, 60);
    const name = typeof node.name === "string" ? node.name.trim().slice(0, 130) : "";
    if (ingredients.length < 2 || instructions.length < 1 || !name) continue;
    const recipe: ParsedRecipe = {
      name,
      ingredients,
      instructions,
      prepMinutes: minutes(node.totalTime ?? node.prepTime, 30),
      category: "Importeret",
      favorite: false,
      leftoverFriendly: false,
      freezerFriendly: false,
      custom: true,
      sourceUrl,
    };
    const image = imageOf(node.image);
    if (image?.startsWith("https://")) recipe.imageUrl = image;
    return recipe;
  }
  return null;
}

/** Refuses non-HTTPS URLs and obviously internal hosts (the add-on sits next to Home Assistant's network). */
export function assertPublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw unprocessable("Linket er ikke en gyldig adresse.");
  }
  const host = url.hostname.toLowerCase();
  const isIp = /^\d+\.\d+\.\d+\.\d+$/u.test(host) || host.includes(":");
  const internal =
    !host.includes(".") ||
    isIp ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost");
  if (url.protocol !== "https:" || url.username || url.password || internal) {
    throw unprocessable("Kun almindelige https-links til offentlige opskriftssider kan importeres.");
  }
  return url;
}

async function readLimited(response: Response): Promise<string | null> {
  if (Number(response.headers.get("content-length") ?? 0) > MAX_HTML) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let html = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return html;
    html += decoder.decode(value, { stream: true });
    if (html.length > MAX_HTML) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
  }
}

export async function importRecipeFromUrl(
  rawUrl: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<ParsedRecipe> {
  let url = assertPublicHttpsUrl(rawUrl);
  let response: Response | undefined;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    try {
      response = await fetcher(url.href, {
        signal,
        redirect: "manual",
        headers: { accept: "text/html,application/xhtml+xml" },
      });
    } catch {
      throw unprocessable("Opskriftssiden kunne ikke hentes. Åbn originalen i stedet.");
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = assertPublicHttpsUrl(new URL(location, url).href);
      continue;
    }
    break;
  }
  if (!response?.ok) throw unprocessable("Opskriftssiden kunne ikke åbnes direkte.");
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) {
    throw unprocessable("Linket peger ikke på en opskriftsside.");
  }
  const html = await readLimited(response);
  if (html === null) throw unprocessable("Opskriftssiden er for stor eller kunne ikke læses.");
  const recipe = parseRecipeHtml(html, url.href);
  if (!recipe) {
    throw unprocessable("Siden indeholder ikke komplette opskriftsdata. Du kan stadig åbne originalen.");
  }
  return recipe;
}
