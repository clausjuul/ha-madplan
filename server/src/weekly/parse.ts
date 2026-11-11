/** Pure HTML parsing for published weekly meal plans. No network here, so it is easy to test. */

export const WEEKDAYS = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"] as const;

export type PlanLink = { day: number; name: string; url: string };

const NAMED: Record<string, string> = {
  amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", rarr: "→",
  aelig: "æ", oslash: "ø", aring: "å", AElig: "Æ", Oslash: "Ø", Aring: "Å", eacute: "é",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
    return NAMED[code] ?? whole;
  });
}

export const plainText = (html: string): string =>
  decodeEntities(html.replace(/<[^>]*>/gu, " ")).replace(/\s+/gu, " ").trim();

/** Link texts that point at navigation, membership or ingredient pages rather than a dish. */
const NOT_A_DISH =
  /^(?:(?:se|læs|klik|bliv|få|du finder|her|madplan|ugeplan|log ind|tilmeld)(?![\p{L}])|(?:opskrift(?:en)?|klassisk|børnefamilie|vegetarisk|vegetar)$)/iu;
const NOT_A_DISH_SLUG = /(madplan|ugeplan|bliv-medlem|medlem|min-konto|kontakt|nyhedsbrev|morgenmad|basislager|indkoebsliste)/iu;

/** A recipe URL on the plan's own site: https, same host, exactly one path segment. */
export function recipeUrl(href: string, base: URL): URL | null {
  let url: URL;
  try {
    url = new URL(decodeEntities(href), base);
  } catch {
    return null;
  }
  const host = (value: string): string => value.toLowerCase().replace(/^www\./u, "");
  if (url.protocol !== "https:" || host(url.hostname) !== host(base.hostname)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 1 || NOT_A_DISH_SLUG.test(segments[0] ?? "")) return null;
  url.hash = "";
  url.search = "";
  return url;
}

/** "Husarsteg – fyldt nakkefilet …" -> "Husarsteg". Keeps the whole text when the head would be too short. */
export function dishName(text: string): string {
  const head = text.split(/\s+[–—-]\s+/u)[0]?.trim() ?? "";
  const name = head.length >= 4 ? head : text;
  const clean = name.replace(/[.:]+$/u, "").slice(0, 130).trim();
  return clean.charAt(0).toLocaleUpperCase("da-DK") + clean.slice(1);
}

/**
 * Reads "Mandag … <a>dish</a> … Tirsdag … <a>dish</a>" style posts: after each weekday word,
 * the first link to a recipe on the same site is that day's dish.
 */
export function dishesByWeekday(html: string, pageUrl: string): PlanLink[] {
  const base = new URL(pageUrl);
  const body = html.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/giu, " ");
  const tokens =
    /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>|(?<![\p{L}])(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)(?![\p{L}])/giu;
  const found = new Map<number, PlanLink>();
  const used = new Set<string>();
  let day: number | null = null;
  for (const match of body.matchAll(tokens)) {
    const weekday = match[3];
    if (weekday) {
      const index = WEEKDAYS.indexOf(weekday.toLocaleLowerCase("da-DK") as (typeof WEEKDAYS)[number]);
      day = found.has(index) ? null : index;
      continue;
    }
    if (day === null) continue;
    const text = plainText(match[2] ?? "");
    if (text.length < 4 || NOT_A_DISH.test(text)) continue;
    const url = recipeUrl(match[1] ?? "", base);
    if (!url || url.href === base.href || used.has(url.href)) continue;
    found.set(day, { day, name: dishName(text), url: url.href });
    used.add(url.href);
    day = null;
  }
  return [...found.values()].sort((a, b) => a.day - b.day);
}

/** Valdemarsro's /madplan/ page: a "Madplan uge NN" grid of seven photo links, Monday first. */
export function valdemarsroPlan(html: string, pageUrl: string): { week: number; links: PlanLink[] } | null {
  const heading = /Madplan\s*<\/span>\s*<span[^>]*>\s*uge\s*(\d{1,2})/iu.exec(html);
  if (!heading) return null;
  const base = new URL(pageUrl);
  const after = html.slice(heading.index);
  const links: PlanLink[] = [];
  for (const match of after.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*class\s*=\s*["'][^"']*lm-mealplan-grid-image/giu)) {
    const url = recipeUrl(match[1] ?? "", base);
    if (!url || links.some((link) => link.url === url.href)) continue;
    links.push({ day: links.length, name: nameFromAnchors(html, url.href) ?? "", url: url.href });
    if (links.length === 7) break;
  }
  return links.length > 0 ? { week: Number(heading[1]), links } : null;
}

function nameFromAnchors(html: string, href: string): string | undefined {
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  for (const match of html.matchAll(new RegExp(`<a\\b[^>]*href\\s*=\\s*["']${escaped}["'][^>]*>([\\s\\S]*?)</a\\s*>`, "giu"))) {
    const text = plainText(match[1] ?? "");
    if (text.length >= 4) return dishName(text);
  }
  return undefined;
}

function metaContent(html: string, key: string): string | undefined {
  for (const tag of html.matchAll(/<meta\b[^>]*>/giu)) {
    const attrs = tag[0];
    const named = new RegExp(`(?:property|name)\\s*=\\s*["']${key}["']`, "iu").test(attrs);
    if (!named) continue;
    const content = /content\s*=\s*["']([^"']*)["']/iu.exec(attrs)?.[1];
    if (content) return decodeEntities(content).trim();
  }
  return undefined;
}

export type PageMeta = { title?: string; description?: string; imageUrl?: string };

/** Photo, title and teaser of a recipe page, from its Open Graph tags. */
export function pageMeta(html: string): PageMeta {
  const meta: PageMeta = {};
  const image = metaContent(html, "og:image");
  if (image?.startsWith("https://")) meta.imageUrl = image;
  const title = metaContent(html, "og:title");
  if (title) meta.title = dishName(title.split(/\s+[|·]\s+|\s+-\s+(?=[^-]+$)/u)[0] ?? title);
  const description = metaContent(html, "og:description") ?? metaContent(html, "description");
  if (description) meta.description = description.slice(0, 300);
  return meta;
}

/** "Madplan for børnefamilien uge 46" is about week 46; "uge 4" must not match "uge 46". */
export function titleIsWeek(title: string, week: number): boolean {
  return new RegExp(`(?<![\\p{L}\\d])uge\\s*${week}(?!\\d)`, "iu").test(title);
}
