import { describe, expect, it } from "vitest";
import type { DishImagesResult } from "@madplan/domain";
import { fakeAi, setup } from "./helpers.ts";

/** A recipe page whose recipe data has the photo `image` (or none). */
const page = (image?: string) =>
  `<html><head><script type="application/ld+json">${JSON.stringify({
    "@type": "Recipe",
    name: "Boller i karry",
    recipeIngredient: ["500 g hakket svinekød", "2 løg"],
    recipeInstructions: "Rul bollerne.\nKog dem i karrysovsen.",
    ...(image ? { image } : {}),
  })}</script></head><body></body></html>`;

const PAGES: Record<string, string> = {
  "https://a.example.dk/boller": page("https://a.example.dk/boller.jpg"),
  "https://b.example.dk/boller": page(),
  "https://c.example.dk/boller": page("https://c.example.dk/foto.jpg"),
  "https://d.example.dk/boller": page("https://a.example.dk/boller.jpg"),
  "https://e.example.dk/boller": page("http://e.example.dk/usikker.jpg"),
};

const fetch = ((input: string | URL | Request) => {
  const html = PAGES[String(input)];
  return Promise.resolve(html ? new Response(html, { headers: { "content-type": "text/html" } }) : new Response("nej", { status: 404 }));
}) as typeof globalThis.fetch;

describe("finding photos for a dish", () => {
  it("offers the photos from the recipe pages the search found, without duplicates or unsafe links", async () => {
    const ai = fakeAi();
    ai.next(JSON.stringify({ pages: [...Object.keys(PAGES), "https://findes-ikke.example.dk/x"] }));
    const { json } = setup({ openai: ai, fetch });
    const result = await json<DishImagesResult>("POST", "dishes/images", { name: "Boller i karry" });
    expect(result.images).toEqual([
      { imageUrl: "https://a.example.dk/boller.jpg", sourceUrl: "https://a.example.dk/boller" },
      { imageUrl: "https://c.example.dk/foto.jpg", sourceUrl: "https://c.example.dk/boller" },
    ]);
    expect(ai.calls[0]?.webSearch).toBe(true);
    expect(ai.calls[0]?.input).toContain("Boller i karry");
  });

  it("returns an empty list when nothing was found, and needs OpenAI and a name", async () => {
    const ai = fakeAi();
    ai.next(JSON.stringify({ pages: [] }));
    const { json, call } = setup({ openai: ai, fetch });
    expect((await json<DishImagesResult>("POST", "dishes/images", { name: "Ukendt ret" })).images).toEqual([]);
    expect((await call("POST", "dishes/images", { name: "" })).status).toBe(400);

    const plain = setup({ fetch });
    const response = await plain.call("POST", "dishes/images", { name: "Boller i karry" });
    expect(response.status).toBe(422);
    expect(((await response.json()) as { message: string }).message).toMatch(/OpenAI/u);
  });
});
