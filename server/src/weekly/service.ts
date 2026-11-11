/** Fetches this week's (and next week's, once out) meal plans from Danish food sites, with photos. */
import { addDaysToKey, isoWeekNumber, parseDateKey, dateKey, startOfWeek } from "@madplan/domain";
import type { InspirationRecipe, WeeklyPlan, WeeklyPlansResponse } from "@madplan/domain";
import { assertPublicHttpsUrl, parseRecipeHtml, readLimited } from "../ai/recipe-import.ts";
import type { Deps } from "../deps.ts";
import type { Repo } from "../repo.ts";
import { todayKey } from "../state.ts";
import { dishesByWeekday, pageMeta, plainText, titleIsWeek, valdemarsroPlan } from "./parse.ts";
import type { PageMeta, PlanLink } from "./parse.ts";
import { WEEKLY_SOURCES } from "./sources.ts";
import type { WeeklySource } from "./sources.ts";

const USER_AGENT = "Madplan Home Assistant add-on (+https://github.com/clausjuul/ha-madplan)";
const FRESH_MS = 6 * 60 * 60 * 1000;
/** Retry sooner when a site was down or had not published yet. */
const PARTIAL_MS = 30 * 60 * 1000;
const MIN_REFRESH_MS = 2 * 60 * 1000;
const PAGE_CONCURRENCY = 6;

type Week = { week: number; weekStart: string };
type Enriched = PageMeta & { prepMinutes?: number; recipeName?: string; recipeImage?: string };
type Cache = {
  response?: WeeklyPlansResponse;
  fetchedMs: number;
  inflight?: Promise<WeeklyPlansResponse>;
  pages: Map<string, Enriched>;
};

const caches = new WeakMap<Repo, Cache>();

function cacheFor(repo: Repo): Cache {
  let cache = caches.get(repo);
  if (!cache) {
    cache = { fetchedMs: 0, pages: new Map() };
    caches.set(repo, cache);
  }
  return cache;
}

function weekOf(mondayKey: string): Week {
  return { week: isoWeekNumber(parseDateKey(mondayKey)), weekStart: mondayKey };
}

async function fetchText(deps: Deps, raw: string, accept: string, signal: AbortSignal): Promise<string> {
  let url = assertPublicHttpsUrl(raw);
  for (let hop = 0; hop <= 3; hop += 1) {
    const response = await deps.fetch(url.href, {
      signal,
      redirect: "manual",
      headers: { accept, "user-agent": USER_AGENT },
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = assertPublicHttpsUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await readLimited(response, 3_000_000);
    if (text === null) throw new Error("for stor");
    return text;
  }
  throw new Error("for mange omdirigeringer");
}

type Found = { title: string; url: string; week: Week; links: PlanLink[] };

async function fromValdemarsro(deps: Deps, source: Extract<WeeklySource, { kind: "valdemarsro" }>, weeks: Week[], signal: AbortSignal): Promise<Found[]> {
  const html = await fetchText(deps, source.url, "text/html", signal);
  const plan = valdemarsroPlan(html, source.url);
  const week = plan && weeks.find((candidate) => candidate.week === plan.week);
  return plan && week ? [{ title: `Madplan uge ${plan.week}`, url: source.url, week, links: plan.links }] : [];
}

type WpPost = { date?: unknown; link?: unknown; title?: { rendered?: unknown }; content?: { rendered?: unknown } };

async function fromWordpress(deps: Deps, source: Extract<WeeklySource, { kind: "wordpress" }>, weeks: Week[], signal: AbortSignal): Promise<Found[]> {
  const found: Found[] = [];
  for (const week of weeks) {
    const query = new URLSearchParams({
      search: `madplan uge ${week.week}`,
      per_page: "10",
      _fields: "date,link,title,content",
    });
    const text = await fetchText(deps, `${source.origin}/wp-json/wp/v2/posts?${query}`, "application/json", signal);
    const posts: unknown = JSON.parse(text);
    if (!Array.isArray(posts)) throw new Error("uventet svar");
    const earliest = addDaysToKey(week.weekStart, -12);
    const latest = addDaysToKey(week.weekStart, 6);
    for (const post of posts as WpPost[]) {
      const title = typeof post.title?.rendered === "string" ? plainText(post.title.rendered) : "";
      const link = typeof post.link === "string" ? post.link : "";
      const html = typeof post.content?.rendered === "string" ? post.content.rendered : "";
      const date = typeof post.date === "string" ? post.date.slice(0, 10) : "";
      if (!title || !link || !html || date < earliest || date > latest) continue;
      if (!titleIsWeek(title, week.week) || source.skipTitle?.test(title)) continue;
      if (!link.startsWith(`${source.origin}/`)) continue;
      const links = dishesByWeekday(html, link);
      if (links.length >= 3) found.push({ title, url: link, week, links });
    }
  }
  return found;
}

async function enrich(deps: Deps, cache: Cache, urls: string[], signal: AbortSignal): Promise<void> {
  const todo = urls.filter((url) => !cache.pages.has(url));
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < todo.length) {
      const url = todo[next++] as string;
      try {
        const html = await fetchText(deps, url, "text/html", signal);
        const recipe = parseRecipeHtml(html, url);
        cache.pages.set(url, {
          ...pageMeta(html),
          ...(recipe ? { prepMinutes: recipe.prepMinutes, recipeName: recipe.name } : {}),
          ...(recipe?.imageUrl ? { recipeImage: recipe.imageUrl } : {}),
        });
      } catch {
        // A missing photo must not drop the dish; it is tried again on the next refresh.
      }
    }
  };
  await Promise.all(Array.from({ length: PAGE_CONCURRENCY }, worker));
}

function toRecipe(link: PlanLink, sourceName: string, page: Enriched | undefined): InspirationRecipe {
  const name = link.name || page?.recipeName || page?.title || link.url;
  const recipe: InspirationRecipe = {
    id: `weekly-${Buffer.from(link.url).toString("base64url").slice(0, 120)}`,
    name,
    cuisine: "International",
    prepMinutes: page?.prepMinutes ?? 30,
    description: page?.description ?? "",
    tags: [],
    sourceName,
    sourceUrl: link.url,
  };
  const image = page?.imageUrl ?? page?.recipeImage;
  if (image) recipe.imageUrl = image;
  return recipe;
}

async function load(deps: Deps, cache: Cache, signal: AbortSignal): Promise<WeeklyPlansResponse> {
  const monday = dateKey(startOfWeek(parseDateKey(todayKey(deps))));
  const current = weekOf(monday);
  const weeks = [current, weekOf(addDaysToKey(monday, 7))];
  const failures: WeeklyPlansResponse["failures"] = [];
  const perSource = await Promise.all(
    WEEKLY_SOURCES.map(async (source) => {
      try {
        const found =
          source.kind === "valdemarsro"
            ? await fromValdemarsro(deps, source, weeks, signal)
            : await fromWordpress(deps, source, weeks, signal);
        if (!found.some((plan) => plan.week.week === current.week)) {
          failures.push({ sourceName: source.name, message: `Ingen madplan for uge ${current.week} endnu.` });
        }
        return found.map((plan) => ({ ...plan, sourceName: source.name }));
      } catch {
        failures.push({ sourceName: source.name, message: "Siden kunne ikke læses lige nu." });
        return [];
      }
    }),
  );
  const found = perSource.flat();
  await enrich(deps, cache, [...new Set(found.flatMap((plan) => plan.links.map((link) => link.url)))], signal);
  const plans: WeeklyPlan[] = found.map((plan) => ({
    id: `weekly-plan-${Buffer.from(plan.url).toString("base64url").slice(0, 120)}`,
    sourceName: plan.sourceName,
    title: plan.title,
    url: plan.url,
    week: plan.week.week,
    weekStart: plan.week.weekStart,
    dishes: plan.links.map((link) => ({ day: link.day, recipe: toRecipe(link, plan.sourceName, cache.pages.get(link.url)) })),
  }));
  failures.sort((a, b) => a.sourceName.localeCompare(b.sourceName, "da"));
  return { week: current.week, weekStart: current.weekStart, fetchedAt: deps.now().toISOString(), plans, failures };
}

/** Cached for six hours and per week; `refresh` refetches unless the last fetch was moments ago. */
export async function weeklyPlans(deps: Deps, options: { refresh?: boolean } = {}): Promise<WeeklyPlansResponse> {
  const cache = cacheFor(deps.repo);
  const nowMs = deps.now().getTime();
  const monday = dateKey(startOfWeek(parseDateKey(todayKey(deps))));
  const age = nowMs - cache.fetchedMs;
  const sameWeek = cache.response?.weekStart === monday;
  if (cache.response && sameWeek && age < (options.refresh ? MIN_REFRESH_MS : cache.response.failures.length > 0 ? PARTIAL_MS : FRESH_MS)) return cache.response;
  if (cache.inflight) return cache.inflight;
  cache.inflight = load(deps, cache, AbortSignal.timeout(60_000))
    .then((response) => {
      cache.response = response;
      cache.fetchedMs = nowMs;
      return response;
    })
    .finally(() => {
      cache.inflight = undefined;
    });
  return cache.inflight;
}
