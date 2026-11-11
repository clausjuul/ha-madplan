import { describe, expect, it } from "vitest";
import type { WeeklyPlansResponse } from "@madplan/domain";
import { dishesByWeekday, dishName, pageMeta, titleIsWeek, valdemarsroPlan } from "../src/weekly/parse.ts";
import { setup } from "./helpers.ts";

const recipePage = (title: string, image: string, minutes = "PT40M") => `<html><head>
<meta property="og:title" content="${title} - Siden" />
<meta property="og:image" content="${image}" />
<meta property="og:description" content="Lækker ${title.toLowerCase()} til hele familien." />
<script type="application/ld+json">{"@type":"Recipe","name":"${title}","totalTime":"${minutes}",
"recipeIngredient":["1 løg","2 gulerødder"],"recipeInstructions":["Kog det hele."]}</script></head></html>`;

const planPost = `
<p>Tirsdag er Mortensaften, så vi starter med noget grønt.</p>
<h2>Mandag</h2><p><a href="https://madensverden.dk/knoldselleri/">Se mere om knoldselleri</a></p>
<p><a href="https://madensverden.dk/sellerifad/">Sellerifad med bønner</a></p>
<h2>Tirsdag</h2><p><a href="https://madensverden.dk/tag/and/">And</a> <a href="https://madensverden.dk/andebryst/">Andebryst i ovn</a></p>
<h2>Onsdag</h2><p><a href="https://andet-site.dk/laks/">Laks</a><a href="https://madensverden.dk/laks/">Glaseret laks &amp; blomkålsris</a></p>
<h2>Torsdag</h2><p><a href="https://madensverden.dk/husarsteg/">husarsteg – fyldt nakkefilet, 2 timer</a></p>
<h2>Fredag</h2><p><a href="https://madensverden.dk/ugens-madplan-uge-45/">Madplan uge 45</a></p>
<h2>Lørdag</h2><p><a href="https://madensverden.dk/bliv-medlem/">Bliv medlem</a></p>
<h2>Søndag</h2><p><a href="https://madensverden.dk/farsbroed/">Farsbrød</a></p>`;

describe("weekly plan parsing", () => {
  it("takes the first dish link after each weekday and skips navigation, tags and other sites", () => {
    const links = dishesByWeekday(planPost, "https://madensverden.dk/ugens-madplan-uge-46/");
    expect(links.map((link) => [link.day, link.name, new URL(link.url).pathname])).toEqual([
      [0, "Sellerifad med bønner", "/sellerifad/"],
      [1, "Andebryst i ovn", "/andebryst/"],
      [2, "Glaseret laks & blomkålsris", "/laks/"],
      [3, "Husarsteg", "/husarsteg/"],
      [6, "Farsbrød", "/farsbroed/"],
    ]);
  });

  it("reads Valdemarsro's photo grid in day order", () => {
    const html = `<a href="https://www.valdemarsro.dk/medister/">Medister med kål</a>
      <span class="a">Madplan</span> <span class="b">uge 46</span>
      <a href="https://www.valdemarsro.dk/bagekartofler/" class="lm-mealplan-grid-image" style=""></a>
      <a href="https://www.valdemarsro.dk/medister/" class="lm-mealplan-grid-image" style=""></a>`;
    expect(valdemarsroPlan(html, "https://www.valdemarsro.dk/madplan/")).toEqual({
      week: 46,
      links: [
        { day: 0, name: "", url: "https://www.valdemarsro.dk/bagekartofler/" },
        { day: 1, name: "Medister med kål", url: "https://www.valdemarsro.dk/medister/" },
      ],
    });
  });

  it("reads Open Graph photo, title and teaser", () => {
    expect(pageMeta(recipePage("Musaka", "https://x.dk/musaka.jpg"))).toEqual({
      imageUrl: "https://x.dk/musaka.jpg",
      title: "Musaka",
      description: "Lækker musaka til hele familien.",
    });
    expect(pageMeta('<meta property="og:image" content="http://x.dk/a.jpg">').imageUrl).toBeUndefined();
  });

  it("matches week numbers exactly", () => {
    expect(titleIsWeek("Madplan for børnefamilien uge 46", 46)).toBe(true);
    expect(titleIsWeek("Sund madplan uge 46, 2026", 46)).toBe(true);
    expect(titleIsWeek("Madplan uge 46", 4)).toBe(false);
    expect(titleIsWeek("Madplan uge 146", 46)).toBe(false);
    expect(dishName("Kalvemørbrad.")).toBe("Kalvemørbrad");
  });
});

type Route = (url: URL) => { status?: number; body: string; type?: string } | undefined;

function fakeWeb(route: Route) {
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.href);
    const answer = route(url);
    if (!answer) return new Response("nej", { status: 404 });
    return new Response(answer.body, { status: answer.status ?? 200, headers: { "content-type": answer.type ?? "text/html" } });
  }) as typeof fetch;
  return { fetcher, calls };
}

const wpPosts = (posts: { date: string; link: string; title: string; content: string }[]) =>
  JSON.stringify(posts.map((post) => ({ ...post, title: { rendered: post.title }, content: { rendered: post.content } })));

describe("GET weekly-plans", () => {
  it("collects this and next week's plans with photos, and reports sources without a plan", async () => {
    const web = fakeWeb((url) => {
      if (url.hostname === "madensverden.dk" && url.pathname === "/wp-json/wp/v2/posts") {
        const search = url.searchParams.get("search");
        if (search === "madplan uge 46") {
          return {
            type: "application/json",
            body: wpPosts([
              { date: "2026-11-06T06:00:00", link: "https://madensverden.dk/ugens-madplan-uge-46/", title: "Ugens madplan uge 46", content: planPost },
              // Last year's post with the same week number is ignored.
              { date: "2025-11-07T06:00:00", link: "https://madensverden.dk/ugens-madplan-uge-46-2025/", title: "Ugens madplan uge 46", content: planPost },
              // Too few dishes to be a plan.
              { date: "2026-11-06T06:00:00", link: "https://madensverden.dk/uge-46-kager/", title: "Kager uge 46", content: "<p>Mandag <a href='https://madensverden.dk/kage/'>Kage</a></p>" },
            ]),
          };
        }
        return { type: "application/json", body: "[]" };
      }
      if (url.hostname === "madensverden.dk") {
        const slug = url.pathname.replaceAll("/", "");
        if (slug === "andebryst") return { status: 500, body: "fejl" };
        return { body: recipePage(slug, `https://madensverden.dk/img/${slug}.jpg`) };
      }
      if (url.hostname === "sundpaabudget.dk") return { status: 503, body: "nede" };
      return { type: "application/json", body: "[]" };
    });
    const { json } = setup({ fetch: web.fetcher });
    const result = await json<WeeklyPlansResponse>("GET", "weekly-plans");

    expect(result).toMatchObject({ week: 46, weekStart: "2026-11-09" });
    expect(result.plans).toHaveLength(1);
    const [plan] = result.plans;
    expect(plan).toMatchObject({ sourceName: "Madens Verden", title: "Ugens madplan uge 46", week: 46, weekStart: "2026-11-09" });
    expect(plan?.dishes.map((dish) => dish.recipe.name)).toEqual([
      "Sellerifad med bønner", "Andebryst i ovn", "Glaseret laks & blomkålsris", "Husarsteg", "Farsbrød",
    ]);
    const [monday, tuesday] = plan?.dishes ?? [];
    expect(monday?.recipe).toMatchObject({
      imageUrl: "https://madensverden.dk/img/sellerifad.jpg",
      prepMinutes: 40,
      sourceName: "Madens Verden",
      sourceUrl: "https://madensverden.dk/sellerifad/",
      description: "Lækker sellerifad til hele familien.",
    });
    // A recipe page that fails keeps the dish, just without a photo.
    expect(tuesday?.recipe.imageUrl).toBeUndefined();
    expect(tuesday?.recipe.name).toBe("Andebryst i ovn");

    expect(result.failures).toContainEqual({ sourceName: "Sund på budget", message: "Siden kunne ikke læses lige nu." });
    expect(result.failures).toContainEqual({ sourceName: "Hurtigmums", message: "Ingen madplan for uge 46 endnu." });
    expect(result.failures.map((failure) => failure.sourceName)).not.toContain("Madens Verden");
    expect(web.calls.some((call) => call.includes("search=madplan+uge+47"))).toBe(true);

    // Served from the cache the second time, and a refresh right after is ignored.
    const before = web.calls.length;
    await json("GET", "weekly-plans");
    await json("GET", "weekly-plans?refresh=1");
    expect(web.calls.length).toBe(before);
  });

  it("does not fail when every site is unreachable", async () => {
    const { json } = setup({ fetch: () => Promise.reject(new Error("offline")) });
    const result = await json<WeeklyPlansResponse>("GET", "weekly-plans");
    expect(result.plans).toEqual([]);
    expect(result.failures).toHaveLength(6);
  });
});
