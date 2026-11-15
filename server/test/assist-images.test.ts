import { describe, expect, it } from "vitest";
import type { AssistApplyResult, AssistResponse, BootstrapResponse } from "@madplan/domain";
import { fakeAi, setup } from "./helpers.ts";

const ASK = { messages: [{ role: "user", content: "Find et billede til lasagne" }], context: { view: "retter" } };
const answer = (reply: string, actions: unknown[]): string => JSON.stringify({ reply, actions });

const recipePage = (image: string): string => `<html><head><script type="application/ld+json">${JSON.stringify({
  "@type": "Recipe",
  name: "Lasagne",
  image,
  recipeIngredient: ["500 g hakket oksekød", "lasagneplader"],
  recipeInstructions: ["Lav kødsovs.", "Byg lasagnen."],
})}</script></head><body></body></html>`;

function fakeFetch(pages: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const html = pages[url];
    if (!html) return new Response("nope", { status: 404 });
    return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  }) as typeof fetch;
}

describe("assist finds dish photos", () => {
  it("turns findDishImage into a photo read from a real recipe page, and applies and undoes it", async () => {
    const ai = fakeAi();
    const fetch = fakeFetch({
      "https://example.dk/ingen-opskrift": "<html></html>",
      "https://example.dk/lasagne": recipePage("https://cdn.example.dk/lasagne.jpg"),
    });
    const { json } = setup({ openai: ai, fetch });
    ai.next(answer("Jeg foreslår et billede.", [{ type: "findDishImage", dishId: "lasagne" }]));
    ai.next(JSON.stringify({ pages: ["http://usikker.dk/x", "https://example.dk/ingen-opskrift", "https://example.dk/lasagne"] }));

    const response = await json<AssistResponse>("POST", "assist", ASK);
    expect(ai.calls[1]?.webSearch).toBe(true);
    expect(response.proposal?.actions).toEqual([
      expect.objectContaining({
        type: "setDishImage",
        dishId: "lasagne",
        imageUrl: "https://cdn.example.dk/lasagne.jpg",
        sourceUrl: "https://example.dk/lasagne",
      }),
    ]);
    expect(response.proposal?.actions[0]?.label).toMatch(/example\.dk.*Lasagne/u);

    const result = await json<AssistApplyResult>("POST", `assist/proposals/${response.proposal?.id}/apply`);
    expect(result.applied).toBe(1);
    const dish = (await json<BootstrapResponse>("GET", "bootstrap")).dishes.find((entry) => entry.id === "lasagne");
    expect(dish?.imageUrl).toBe("https://cdn.example.dk/lasagne.jpg");
    expect(dish?.imageKey).toBeUndefined();

    await json("POST", `assist/undo/${result.undoId}`);
    const restored = (await json<BootstrapResponse>("GET", "bootstrap")).dishes.find((entry) => entry.id === "lasagne");
    expect(restored?.imageUrl).not.toBe("https://cdn.example.dk/lasagne.jpg");
  });

  it("says so when no photo is found, and proposes nothing", async () => {
    const ai = fakeAi();
    const { json } = setup({ openai: ai, fetch: fakeFetch({}) });
    ai.next(answer("Jeg kigger.", [{ type: "findDishImage", dishId: "lasagne" }]));
    ai.next(JSON.stringify({ pages: ["https://example.dk/findes-ikke"] }));
    const response = await json<AssistResponse>("POST", "assist", ASK);
    expect(response.proposal).toBeUndefined();
    expect(response.reply).toMatch(/fandt ikke et brugbart billede/u);
  });

  it("refuses an image URL that is not public https", async () => {
    const ai = fakeAi();
    const { json } = setup({ openai: ai });
    ai.next(answer("Billede.", [{ type: "setDishImage", dishId: "lasagne", imageUrl: "http://192.168.1.2/x.jpg" }]));
    ai.next(answer("Billede.", []));
    const response = await json<AssistResponse>("POST", "assist", ASK);
    expect(response.proposal).toBeUndefined();
  });

  it("adds a photo to a new dish when createDish asks for one", async () => {
    const ai = fakeAi();
    const fetch = fakeFetch({ "https://example.dk/pasta": recipePage("https://cdn.example.dk/pasta.jpg") });
    const { json } = setup({ openai: ai, fetch });
    ai.next(answer("Ny ret.", [{
      type: "createDish",
      findImage: true,
      dish: { name: "Pasta med pølser", ingredients: ["pasta", "pølser"], prepMinutes: 20, category: "Pasta", servings: 4, instructions: ["Kog pasta."] },
    }]));
    ai.next(JSON.stringify({ pages: ["https://example.dk/pasta"] }));
    const response = await json<AssistResponse>("POST", "assist", ASK);
    const action = response.proposal?.actions[0];
    expect(action?.type).toBe("createDish");
    expect(action?.type === "createDish" ? action.dish.imageUrl : undefined).toBe("https://cdn.example.dk/pasta.jpg");
  });
});
