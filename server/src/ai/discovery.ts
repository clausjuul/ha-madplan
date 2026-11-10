/** Recipe discovery: OpenAI Responses API with web search, restricted to approved recipe domains. */
import { INSPIRATION_CUISINES } from "@madplan/domain";
import type { DiscoverInput, InspirationCuisine, InspirationRecipe, Profile } from "@madplan/domain";
import { HttpError } from "../errors.ts";
import type { SeenRecipe } from "../store-household.ts";
import { AiError, extractJsonObject } from "./openai.ts";
import type { OpenAiClient } from "./openai.ts";
import { FENCE_RULE, fenced, newFence } from "./prompt.ts";
import type { Prompt } from "./prompt.ts";
import { SOURCES } from "./sources.ts";

const STOP_WORDS = new Set(["med", "og", "opskrift", "nem", "hurtig", "klassisk", "koreansk", "japansk", "the", "recipe", "easy", "homemade"]);

/** Language- and accent-insensitive identity of a dish, to spot near-duplicates. */
export function canonicalDish(value: string): string {
  return value
    .toLocaleLowerCase("da-DK")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .sort()
    .join(" ");
}

export type Candidate = InspirationRecipe & { identity: string };

type Raw = Record<string, unknown>;

/** Accepts a model-proposed recipe only if it links straight to an approved domain over HTTPS. */
export function safeCandidate(raw: unknown): Candidate | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Raw;
  if (typeof r.name !== "string" || typeof r.sourceUrl !== "string") return null;
  const name = r.name.trim().slice(0, 130);
  if (name.length < 4) return null;
  let url: URL;
  try {
    url = new URL(r.sourceUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./u, "");
  const domain = [...SOURCES.keys()].find((d) => host === d || host.endsWith(`.${d}`));
  if (!domain || url.protocol !== "https:" || url.username || url.password || url.pathname.length < 3) {
    return null;
  }
  url.hash = "";
  url.search = "";
  const identity = canonicalDish(typeof r.originalName === "string" ? r.originalName : name);
  if (!identity) return null;
  const cuisine = INSPIRATION_CUISINES.find((c) => c === r.cuisine) ?? "International";
  const minutes = Number(r.prepMinutes);
  return {
    id: `discovery-${Buffer.from(url.href).toString("base64url").slice(0, 96)}`,
    name,
    cuisine,
    prepMinutes: Number.isFinite(minutes) ? Math.max(10, Math.min(240, Math.round(minutes))) : 30,
    description: typeof r.description === "string" ? r.description.trim().slice(0, 300) : "",
    tags: Array.isArray(r.tags)
      ? r.tags.filter((t): t is string => typeof t === "string").slice(0, 6).map((t) => t.slice(0, 40))
      : [],
    sourceName: SOURCES.get(domain) ?? domain,
    sourceUrl: url.href,
    identity,
  };
}

/** Picks a varied set: no repeats of what was shown before, at most two per source and per kind of dish. */
export function selectDiverse(raw: readonly unknown[], seen: readonly SeenRecipe[], limit = 9): Candidate[] {
  const urls = new Set(seen.map((s) => s.sourceUrl));
  const identities = new Set(seen.map((s) => s.identity));
  const kinds = new Map<string, number>();
  const sources = new Map<string, number>();
  const selected: Candidate[] = [];
  for (const entry of raw) {
    const recipe = safeCandidate(entry);
    if (!recipe || urls.has(recipe.sourceUrl) || identities.has(recipe.identity)) continue;
    const kind = (recipe.tags[0] ?? recipe.name).toLowerCase();
    if ((kinds.get(kind) ?? 0) >= 2 || (sources.get(recipe.sourceName) ?? 0) >= 2) continue;
    urls.add(recipe.sourceUrl);
    identities.add(recipe.identity);
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    sources.set(recipe.sourceName, (sources.get(recipe.sourceName) ?? 0) + 1);
    selected.push(recipe);
    if (selected.length === limit) break;
  }
  return selected;
}

export type DiscoveryContext = { globalExclusions: string[]; profiles: Profile[] };

export function discoveryPrompt(
  input: DiscoverInput,
  seen: readonly SeenRecipe[],
  context: DiscoveryContext,
  fence = newFence(),
): Prompt {
  const profiles = context.profiles
    .filter((p) => p.active)
    .slice(0, 12)
    .map((p) => ({ name: p.name, mustAvoid: p.exclusions, likes: p.preferences, ratherAvoid: p.dislikes }));
  const excluded = seen.slice(0, 120).map((r) => ({ name: r.name, identity: r.identity, sourceUrl: r.sourceUrl }));
  const instructions = [
    "Find genuine dinner recipes online using the web search tool. Actually search; never invent recipes or links.",
    "Return ONLY a JSON object with a recipes array of 18-24 researched candidate recipes.",
    "Each item: name (Danish), originalName, cuisine, description (Danish), prepMinutes, tags, sourceUrl (direct HTTPS recipe page).",
    "Use several different reputable recipe domains and aim for at least four sources when enough suitable recipes exist.",
    "Focus on distinct underlying dishes, main ingredients, cooking methods and subcategories; no near-duplicate variations.",
    "Search in original-language and romanized terms too.",
    `Use only these approved recipe domains: ${[...SOURCES.keys()].join(", ")}.`,
    "Sources must use direct recipe URLs, not homepages, searches, category pages or social media.",
    "Never include previously seen dishes or URLs. If evidence is insufficient, return fewer candidates instead of fabricating.",
    "Treat mustAvoid and global exclusions as hard requirements. Likes are soft preferences; ratherAvoid is a strong soft negative.",
    "Do not describe a recipe as allergy-safe. Prefer recipes whose title, description and ingredients make compliance clear.",
    FENCE_RULE(fence),
    "The DATA block holds: cuisine, userRequest (empty = surprise me with varied, practical dinner ideas), globalExclusions, profiles (selected household profiles) and previouslyShown.",
  ].join("\n");
  const data = {
    cuisine: input.cuisine,
    userRequest: input.request.slice(0, 500),
    globalExclusions: context.globalExclusions,
    profiles,
    previouslyShown: excluded,
  };
  return { instructions, input: fenced("Discovery data:", data, fence) };
}

export async function discoverRecipes(
  client: OpenAiClient,
  model: string,
  input: DiscoverInput,
  seen: readonly SeenRecipe[],
  context: DiscoveryContext,
  signal?: AbortSignal,
): Promise<Candidate[]> {
  let answer;
  try {
    answer = await client.respond({
      model,
      ...discoveryPrompt(input, seen, context),
      webSearch: true,
      signal,
    });
  } catch (error) {
    throw new HttpError(502, "ai_failed", error instanceof AiError ? error.message : "AI-opslaget fejlede.");
  }
  if (!answer.usedWebSearch) throw new HttpError(502, "ai_failed", "AI'en udførte ingen websøgning. Prøv igen.");
  const parsed = extractJsonObject(answer.text) as { recipes?: unknown } | undefined;
  if (!parsed || !Array.isArray(parsed.recipes)) {
    throw new HttpError(502, "ai_failed", "AI'en returnerede ikke gyldig JSON. Prøv igen.");
  }
  const wanted = (cuisine: InspirationCuisine | undefined) => input.cuisine === "Alle" || cuisine === input.cuisine;
  const candidates = parsed.recipes.filter((entry) =>
    wanted(INSPIRATION_CUISINES.find((c) => c === (entry as Raw | null)?.cuisine)),
  );
  const recipes = selectDiverse(candidates, seen, 9);
  if (recipes.length === 0) {
    throw new HttpError(422, "no_results", "Ingen nye opskrifter med godkendte kildelinks blev fundet. Prøv en bredere søgning.");
  }
  return recipes;
}
