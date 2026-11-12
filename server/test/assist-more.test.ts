import { describe, expect, it } from "vitest";
import type { AssistApplyResult, AssistResponse, AssistStreamEvent, BootstrapResponse, ShoppingList } from "@madplan/domain";
import { partialReply } from "../src/ai/assist-ai.ts";
import { fakeAi, setup } from "./helpers.ts";

const ASK = { messages: [{ role: "user", content: "Hjælp" }], context: { view: "uge" } };
const answer = (reply: string, actions: unknown[]): string => JSON.stringify({ reply, actions });

describe("assist: richer context and structured output", () => {
  it("sends history, ratings, notes, shopping list and a strict schema with real ids", async () => {
    const ai = fakeAi();
    const { json } = setup({ openai: ai });
    await json("PUT", "meals/2026-11-02", { dishId: "lasagne", rating: "up", note: "Mormor på besøg" });
    await json("PUT", "meals/2026-11-10", { dishId: "tacos" });
    await json("POST", "shopping/extras", { label: "Kaffe" });
    ai.next(answer("Ok.", []));
    await json("POST", "assist", ASK);
    const input = ai.calls[0]?.input ?? "";
    expect(input).toContain("Spist de sidste 28 dage");
    expect(input).toMatch(/"date":"2026-11-02"[^}]*"rating":"up"[^}]*"note":"Mormor på besøg"/u);
    expect(input).toContain("daysSinceEaten");
    expect(input).toContain("Kaffe");
    expect(input).toContain("Indkøbslisten");
    const schema = JSON.stringify(ai.calls[0]?.jsonSchema?.schema);
    expect(schema).toContain('"tacos"');
    expect(schema).toContain('"2026-11-09"');
    expect(schema).toContain("rateMeal");
  });

  it("lets the model correct refused actions once", async () => {
    const ai = fakeAi();
    const { json } = setup({ openai: ai });
    ai.next(answer("Jeg sætter en ret på.", [{ type: "setMeal", date: "2026-11-01", dishId: "tacos" }]));
    ai.next(answer("Jeg foreslår tacos i morgen.", [{ type: "setMeal", date: "2026-11-10", dishId: "tacos" }]));
    const response = await json<AssistResponse>("POST", "assist", ASK);
    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1]?.input).toContain("Dagen ligger i fortiden");
    expect(response.reply).toBe("Jeg foreslår tacos i morgen.");
    expect(response.proposal?.actions).toHaveLength(1);
  });

  it("keeps the first answer (with a note) when the correction is no better", async () => {
    const ai = fakeAi();
    const { json } = setup({ openai: ai });
    ai.next(answer("Forslag.", [{ type: "setMeal", date: "2026-11-01", dishId: "tacos" }, { type: "addShoppingExtra", item: "Mælk" }]));
    const response = await json<AssistResponse>("POST", "assist", ASK);
    expect(response.reply).toMatch(/^Forslag\.[\s\S]*1 forslag blev fjernet/u);
    expect(response.proposal?.actions).toHaveLength(1);
  });
});

describe("assist: new actions, partial apply and undo", () => {
  it("applies only the chosen actions, including note, skip, rating and extra removal", async () => {
    const ai = fakeAi();
    const { json } = setup({ openai: ai });
    await json("PUT", "meals/2026-11-08", { dishId: "lasagne" });
    await json("PUT", "meals/2026-11-10", { dishId: "tacos" });
    await json("PUT", "meals/2026-11-11", { dishId: "lasagne" });
    await json("POST", "shopping/extras", { label: "Kaffe" });
    ai.next(
      answer("Forslag.", [
        { type: "rateMeal", date: "2026-11-08", rating: "up" },
        { type: "setMealNote", date: "2026-11-10", note: "Gæster" },
        { type: "skipMeal", date: "2026-11-11", skipped: true },
        { type: "removeShoppingExtra", item: "kaffe" },
        { type: "addShoppingExtra", item: "Te", label: null },
      ]),
    );
    const { proposal } = await json<AssistResponse>("POST", "assist", ASK);
    expect(proposal?.actions.map((action) => action.type)).toEqual(["rateMeal", "setMealNote", "skipMeal", "removeShoppingExtra", "addShoppingExtra"]);
    const result = await json<AssistApplyResult>("POST", `assist/proposals/${proposal?.id}/apply`, { only: [0, 1, 2, 3] });
    expect(result.applied).toBe(4);
    expect(result.results[4]).toMatchObject({ ok: false, message: "Fravalgt." });
    expect(result.undoId).toBeTruthy();
    const boot = await json<BootstrapResponse>("GET", "bootstrap");
    expect(boot.meals["2026-11-08"]?.rating).toBe("up");
    expect(boot.meals["2026-11-10"]?.note).toBe("Gæster");
    expect(boot.meals["2026-11-11"]?.skipped).toBe(true);
    const shopping = await json<ShoppingList>("GET", "shopping");
    expect(JSON.stringify(shopping)).not.toContain("Kaffe");
    expect(JSON.stringify(shopping)).not.toContain('"Te"');
  });

  it("refuses to rate a dish that has not been eaten yet", async () => {
    const ai = fakeAi();
    const { json } = setup({ openai: ai });
    await json("PUT", "meals/2026-11-12", { dishId: "tacos" });
    ai.next(answer("Ok.", [{ type: "rateMeal", date: "2026-11-12", rating: "down" }]));
    ai.next(answer("Ok.", []));
    const response = await json<AssistResponse>("POST", "assist", ASK);
    expect(response.proposal).toBeUndefined();
  });

  it("undoes an apply exactly, archives created dishes, and only once", async () => {
    const ai = fakeAi();
    const { json, call } = setup({ openai: ai });
    await json("PUT", "meals/2026-11-10", { dishId: "lasagne" });
    ai.next(
      answer("Forslag.", [
        { type: "setMeal", date: "2026-11-10", dishId: "tacos" },
        { type: "setMeal", date: "2026-11-11", dishId: "tacos" },
        { type: "addFridgeItem", name: "Skyr", quantity: null, expiresOn: null },
        { type: "createDish", dish: { name: "Fortryd-gryde", ingredients: ["løg"], prepMinutes: 20, category: "Gryde", servings: null, instructions: null } },
      ]),
    );
    const { proposal } = await json<AssistResponse>("POST", "assist", ASK);
    expect(proposal?.actions).toHaveLength(4);
    const result = await json<AssistApplyResult>("POST", `assist/proposals/${proposal?.id}/apply`);
    expect(result.applied).toBe(4);
    await json("POST", `assist/undo/${result.undoId}`);
    const boot = await json<BootstrapResponse>("GET", "bootstrap");
    expect(boot.meals["2026-11-10"]?.dishId).toBe("lasagne");
    expect(boot.meals["2026-11-11"]).toBeUndefined();
    expect(boot.fridge.some((item) => item.name === "Skyr")).toBe(false);
    expect(boot.dishes.find((dish) => dish.name === "Fortryd-gryde")?.archivedAt).toBeTruthy();
    expect((await call("POST", `assist/undo/${result.undoId}`)).status).toBe(404);
  });

  it("refuses to undo when something else changed the data since", async () => {
    const ai = fakeAi();
    const { json, call } = setup({ openai: ai });
    ai.next(answer("Forslag.", [{ type: "setMeal", date: "2026-11-10", dishId: "tacos" }]));
    const { proposal } = await json<AssistResponse>("POST", "assist", ASK);
    const result = await json<AssistApplyResult>("POST", `assist/proposals/${proposal?.id}/apply`);
    await json("PUT", "meals/2026-11-12", { dishId: "lasagne" });
    expect((await call("POST", `assist/undo/${result.undoId}`)).status).toBe(409);
    const boot = await json<BootstrapResponse>("GET", "bootstrap");
    expect(boot.meals["2026-11-10"]?.dishId).toBe("tacos");
  });
});

describe("assist: streaming", () => {
  it("streams NDJSON and ends with the full response", async () => {
    const ai = fakeAi();
    const { call } = setup({ openai: ai });
    ai.next(answer("Hej med dig.", []));
    const response = await call("POST", "assist/stream", ASK);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as AssistStreamEvent);
    expect(events.at(-1)).toMatchObject({ type: "done", response: { reply: "Hej med dig.", engine: "openai" } });
  });

  it("reports errors as a final error event", async () => {
    const { call } = setup();
    const response = await call("POST", "assist/stream", ASK);
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as AssistStreamEvent);
    expect(events.at(-1)).toMatchObject({ type: "error", status: 503 });
  });

  it("reads the reply out of an incomplete JSON answer", () => {
    expect(partialReply('{"rep')).toBe("");
    expect(partialReply('{"reply":"Hej')).toBe("Hej");
    expect(partialReply('{"reply":"Linje\\nto \\"citat\\" \\u00e6')).toBe('Linje\nto "citat" æ');
    expect(partialReply('{"reply":"Hej\\')).toBe("Hej");
    expect(partialReply('{"reply":"Færdig","actions":[')).toBe("Færdig");
  });
});
