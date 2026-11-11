import { describe, expect, it } from "vitest";
import type { ApiError, BootstrapResponse, Meal, MealMap } from "@madplan/domain";
import { loadConfig } from "../src/config.ts";
import { setup } from "./helpers.ts";

describe("bootstrap and health", () => {
  it("serves the built-in catalog on an empty database", async () => {
    const { json } = setup();
    const data = await json<BootstrapResponse>("GET", "bootstrap");
    expect(data.isEmpty).toBe(true);
    expect(data.revision).toBe(0);
    expect(data.dishes.length).toBeGreaterThan(20);
    expect(data.capabilities).toEqual({ openai: false, homeAssistantAgent: false, offers: false });
    expect(await json("GET", "health")).toEqual({ ok: true, version: loadConfig({}, "./none.json").version });
  });

  it("returns Danish JSON errors for unknown endpoints", async () => {
    const { call } = setup();
    const response = await call("GET", "nope");
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiError;
    expect(body.error).toBe("not_found");
    expect(body.message).toMatch(/findes ikke/u);
  });
});

describe("meals", () => {
  it("creates, patches and deletes a meal and bumps the revision each time", async () => {
    const { json, call } = setup();
    const meal = await json<Meal>("PUT", "meals/2026-11-10", { dishId: "lasagne", note: "Med salat" });
    expect(meal).toMatchObject({ dishId: "lasagne", locked: false, source: "manual", note: "Med salat" });
    const patched = await json<Meal>("PATCH", "meals/2026-11-10", { locked: true });
    expect(patched.locked).toBe(true);
    expect(patched.note).toBe("Med salat");
    const boot = await json<BootstrapResponse>("GET", "bootstrap");
    expect(boot.meals["2026-11-10"]?.locked).toBe(true);
    expect(boot.revision).toBe(2);
    expect(boot.isEmpty).toBe(false);

    expect((await call("DELETE", "meals/2026-11-10")).status).toBe(409);
    await json("PATCH", "meals/2026-11-10", { locked: false });
    expect((await call("DELETE", "meals/2026-11-10")).status).toBe(204);
    expect((await call("DELETE", "meals/2026-11-10")).status).toBe(404);
  });

  it("refuses PUT over a locked meal with 409 unless only `locked` changes", async () => {
    const { json, call } = setup();
    await json("PUT", "meals/2026-11-10", { dishId: "lasagne", locked: true, note: "Fast" });
    const refused = await call("PUT", "meals/2026-11-10", { dishId: "tacos", locked: true });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as ApiError).message).toMatch(/låst/u);
    expect((await call("PUT", "meals/2026-11-10", { dishId: "lasagne", locked: true, note: "Andet" })).status).toBe(409);
    const unlocked = await json<Meal>("PUT", "meals/2026-11-10", { dishId: "lasagne", locked: false, note: "Fast" });
    expect(unlocked.locked).toBe(false);
    const replaced = await json<Meal>("PUT", "meals/2026-11-10", { dishId: "tacos" });
    expect(replaced.dishId).toBe("tacos");
  });

  it("validates dates, bodies and dish ids", async () => {
    const { call } = setup();
    expect((await call("PUT", "meals/ikke-en-dato", { dishId: "lasagne" })).status).toBe(400);
    expect((await call("PUT", "meals/2026-11-10", {})).status).toBe(400);
    expect((await call("PUT", "meals/2026-11-10", { dishId: "findes-ikke" })).status).toBe(422);
    expect((await call("PATCH", "meals/2026-11-11", { note: "x" })).status).toBe(404);
    const bad = await call("PUT", "meals/2026-11-10", { dishId: "lasagne", source: "robot" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as ApiError).message).toMatch(/ugyldig/u);
  });

  it("swaps meals, moves into an empty day, and refuses locked or identical days", async () => {
    const { json, call } = setup();
    await json("PUT", "meals/2026-11-10", { dishId: "lasagne" });
    await json("PUT", "meals/2026-11-11", { dishId: "tacos" });
    const swapped = await json<MealMap>("POST", "meals/swap", { a: "2026-11-10", b: "2026-11-11" });
    expect(swapped["2026-11-10"]?.dishId).toBe("tacos");
    expect(swapped["2026-11-11"]?.dishId).toBe("lasagne");

    const moved = await json<MealMap>("POST", "meals/swap", { a: "2026-11-10", b: "2026-11-12" });
    expect(Object.keys(moved)).toEqual(["2026-11-12"]);

    await json("PATCH", "meals/2026-11-11", { locked: true });
    expect((await call("POST", "meals/swap", { a: "2026-11-11", b: "2026-11-12" })).status).toBe(409);
    expect((await call("POST", "meals/swap", { a: "2026-11-12", b: "2026-11-12" })).status).toBe(400);
    expect((await call("POST", "meals/swap", { a: "2026-11-20", b: "2026-11-21" })).status).toBe(404);
  });

  it("suggests a dish locally and refuses a locked day", async () => {
    const { json, call } = setup();
    const meal = await json<Meal>("POST", "meals/2026-11-10/suggest", { seed: 7 });
    expect(meal.source).toBe("local");
    expect(meal.reason).toBeTruthy();
    expect((await json<BootstrapResponse>("GET", "bootstrap")).meals["2026-11-10"]?.dishId).toBe(meal.dishId);
    const again = await json<Meal>("POST", "meals/2026-11-10/suggest", { seed: 7 });
    expect(again.dishId).toBe(meal.dishId);

    await json("PATCH", "meals/2026-11-10", { locked: true });
    expect((await call("POST", "meals/2026-11-10/suggest", { seed: 1 })).status).toBe(409);
    expect((await call("POST", "meals/2026-11-11/suggest", {})).status).toBe(400);
  });
});
