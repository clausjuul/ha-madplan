import { describe, expect, it } from "vitest";
import { DISHES } from "@madplan/domain";
import type { ApiError, BootstrapResponse, PlanDraftRecord, PlanRequest } from "@madplan/domain";
import { AiError } from "../src/ai/openai.ts";
import { fakeAi, setup, TODAY } from "./helpers.ts";

const request = (overrides: Partial<PlanRequest> = {}): PlanRequest => ({
  engine: "local",
  from: TODAY,
  dayCount: 4,
  skippedDates: [],
  newDishCount: 0,
  requiredDishIds: [],
  request: "",
  dayRequests: {},
  seed: 3,
  ...overrides,
});

const planAnswer = (dates: string[], ids: string[]): string =>
  JSON.stringify({
    message: "Her er en plan",
    plan: dates.map((date, index) => ({ date, dishId: ids[index], reason: "AI-begrundelse" })),
  });

describe("local plan drafts", () => {
  it("creates a ready local draft immediately, with a review, and exposes it as current", async () => {
    const { json } = setup();
    expect(await json("GET", "plan-drafts/current")).toBeNull();
    const draft = await json<PlanDraftRecord>("POST", "plan-drafts", request());
    expect(draft).toMatchObject({ status: "ready", engine: "local" });
    expect(draft.days.map((d) => d.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(new Set(draft.days.map((d) => d.dishId)).size).toBe(4);
    expect(draft.review?.checks.length).toBeGreaterThan(3);
    expect(await json("GET", "plan-drafts/current")).toEqual(draft);
  });

  it("keeps only one current draft and rejects infeasible requests", async () => {
    const { json, call } = setup();
    const first = await json<PlanDraftRecord>("POST", "plan-drafts", request());
    const second = await json<PlanDraftRecord>("POST", "plan-drafts", request({ seed: 9 }));
    expect(second.id).not.toBe(first.id);
    expect((await json<PlanDraftRecord>("GET", "plan-drafts/current")).id).toBe(second.id);
    expect((await call("GET", `plan-drafts/${first.id}`)).status).toBe(404);

    const tooMany = await call("POST", "plan-drafts", request({ dayCount: 2, newDishCount: 5 }));
    expect(tooMany.status).toBe(422);
    expect(((await tooMany.json()) as ApiError).message).toMatch(/Justér/u);
    expect((await call("POST", "plan-drafts", { engine: "local" })).status).toBe(400);
  });

  it("respects locked meals, required dishes and skipped dates", async () => {
    const { json } = setup();
    await json("PUT", "meals/2026-11-10", { dishId: "lasagne", locked: true });
    const draft = await json<PlanDraftRecord>(
      "POST",
      "plan-drafts",
      request({ requiredDishIds: ["pizza"], skippedDates: ["2026-11-11"] }),
    );
    const byDate = Object.fromEntries(draft.days.map((d) => [d.date, d]));
    expect(byDate["2026-11-10"]).toMatchObject({ dishId: "lasagne", locked: true });
    expect(byDate["2026-11-11"]).toBeUndefined();
    expect(draft.days.some((d) => d.dishId === "pizza")).toBe(true);
    expect(draft.days).toHaveLength(4);
  });

  it("patches days, regenerates only unlocked days and applies into meals", async () => {
    const { json, call } = setup();
    const draft = await json<PlanDraftRecord>("POST", "plan-drafts", request());
    const day0 = draft.days[0];
    const day1 = draft.days[1];
    if (!day0 || !day1) throw new Error("tom plan");

    const locked = await json<PlanDraftRecord>("PATCH", `plan-drafts/${draft.id}/days/${day0.date}`, { locked: true });
    expect(locked.days[0]?.locked).toBe(true);
    const manual = await json<PlanDraftRecord>("PATCH", `plan-drafts/${draft.id}/days/${day1.date}`, { dishId: "pizza" });
    expect(manual.days[1]).toMatchObject({ dishId: "pizza", source: "manual" });
    expect((await call("PATCH", `plan-drafts/${draft.id}/days/${day1.date}`, { dishId: "intet" })).status).toBe(422);
    expect((await call("PATCH", `plan-drafts/${draft.id}/days/2030-01-01`, { locked: true })).status).toBe(404);

    const again = await json<PlanDraftRecord>("POST", `plan-drafts/${draft.id}/regenerate`, {});
    expect(again.days[0]).toEqual(locked.days[0]);
    expect(again.days).toHaveLength(4);
    expect(new Set(again.days.map((d) => d.dishId)).size).toBe(4);

    const onlyOne = await json<PlanDraftRecord>("POST", `plan-drafts/${draft.id}/regenerate`, { dates: [day1.date] });
    expect(onlyOne.days.filter((d) => d.date !== day1.date)).toEqual(again.days.filter((d) => d.date !== day1.date));

    const applied = await json<{ meals: Record<string, { dishId: string; source: string }>; addedDishes: unknown[] }>(
      "POST",
      `plan-drafts/${draft.id}/apply`,
    );
    expect(Object.keys(applied.meals)).toHaveLength(4);
    const boot = await json<BootstrapResponse>("GET", "bootstrap");
    expect(boot.meals[day0.date]).toMatchObject({ dishId: day0.dishId, locked: true });
    expect(await json("GET", "plan-drafts/current")).toBeNull();
    expect((await call("POST", `plan-drafts/${draft.id}/apply`)).status).toBe(404);
  });

  it("saves new dishes proposed by a draft as custom dishes on apply, and never overwrites locked meals", async () => {
    const { json, repo } = setup();
    const draft = await json<PlanDraftRecord>("POST", "plan-drafts", request({ dayCount: 2 }));
    const newDish = { ...DISHES[0]!, id: "ai-ny-ret", name: "Ny ret", custom: undefined };
    const stored: PlanDraftRecord = {
      ...draft,
      days: [{ date: "2026-11-09", newDish, reason: "Ny", locked: false, source: "ai" }, ...draft.days.slice(1)],
    };
    repo.db.prepare("UPDATE plan_drafts SET days = ? WHERE id = ?").run(JSON.stringify(stored.days), draft.id);
    await json("PUT", "meals/2026-11-10", { dishId: "tacos", locked: true });
    const applied = await json<{ meals: Record<string, { dishId: string }>; addedDishes: { id: string; custom: boolean }[] }>(
      "POST",
      `plan-drafts/${draft.id}/apply`,
    );
    expect(applied.addedDishes).toMatchObject([{ id: "ai-ny-ret", custom: true }]);
    expect(applied.meals["2026-11-09"]?.dishId).toBe("ai-ny-ret");
    expect(applied.meals["2026-11-10"]?.dishId).toBe("tacos");
    const boot = await json<BootstrapResponse>("GET", "bootstrap");
    expect(boot.dishes.some((d) => d.id === "ai-ny-ret" && d.custom)).toBe(true);
  });

  it("deletes a draft", async () => {
    const { json, call } = setup();
    const draft = await json<PlanDraftRecord>("POST", "plan-drafts", request());
    expect((await call("DELETE", `plan-drafts/${draft.id}`)).status).toBe(204);
    expect((await call("DELETE", `plan-drafts/${draft.id}`)).status).toBe(404);
  });
});

describe("AI plan drafts", () => {
  const dates = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"];

  it("returns 503 when OpenAI is not configured", async () => {
    const { call } = setup();
    const response = await call("POST", "plan-drafts", request({ engine: "ai" }));
    expect(response.status).toBe(503);
    expect(((await response.json()) as ApiError).message).toMatch(/OpenAI/u);
  });

  it("generates in the background, validates the answer and sets ready", async () => {
    const ai = fakeAi();
    ai.next(planAnswer(dates, ["tacos", "pizza", "lasagne", "carbonara"]));
    const { json, deps } = setup({ openai: ai });
    const started = await json<PlanDraftRecord>("POST", "plan-drafts", request({ engine: "ai", request: "Noget hurtigt" }));
    expect(started).toMatchObject({ status: "generating", engine: "ai", days: [] });
    await deps.jobs.settled();
    const done = await json<PlanDraftRecord>("GET", "plan-drafts/current");
    expect(done).toMatchObject({ status: "ready", engine: "ai" });
    expect(done.days.map((d) => d.dishId)).toEqual(["tacos", "pizza", "lasagne", "carbonara"]);
    expect(done.days.every((d) => d.source === "ai")).toBe(true);
    expect(ai.calls[0]?.input).toContain("Noget hurtigt");
    expect(ai.calls[0]?.input).toContain(dates[0]);
    // Untrusted user text and catalogue names stay out of the system instructions.
    expect(ai.calls[0]?.instructions).not.toContain("Noget hurtigt");
    expect(ai.calls[0]?.instructions).not.toContain("Lasagne");
  });

  it("drops invalid suggestions, fills gaps honestly as local days, keeps engine ai", async () => {
    const ai = fakeAi();
    ai.next(planAnswer(dates, ["tacos", "findes-ikke", "lasagne", "tacos"]));
    const { json, deps } = setup({ openai: ai });
    await json("POST", "plan-drafts", request({ engine: "ai" }));
    await deps.jobs.settled();
    const done = await json<PlanDraftRecord>("GET", "plan-drafts/current");
    expect(done.status).toBe("ready");
    expect(done.days).toHaveLength(4);
    expect(done.days.filter((d) => d.source === "ai")).toHaveLength(2);
    expect(done.days.filter((d) => d.source === "local")).toHaveLength(2);
    expect(done.review?.rejectedSuggestions).toBe(2);
  });

  it("fails with a Danish message on invalid JSON and never falls back to local", async () => {
    const ai = fakeAi();
    ai.next("Jeg kan ikke finde på noget i dag");
    const { json, deps } = setup({ openai: ai });
    await json("POST", "plan-drafts", request({ engine: "ai" }));
    await deps.jobs.settled();
    const failed = await json<PlanDraftRecord>("GET", "plan-drafts/current");
    expect(failed.status).toBe("failed");
    expect(failed.engine).toBe("ai");
    expect(failed.days).toEqual([]);
    expect(failed.error).toMatch(/gyldig plan/u);
  });

  it("fails when the model call errors", async () => {
    const ai = fakeAi();
    ai.next(new AiError("AI-tjenesten kunne ikke kontaktes."));
    const { json, deps } = setup({ openai: ai });
    await json("POST", "plan-drafts", request({ engine: "ai" }));
    await deps.jobs.settled();
    expect(await json<PlanDraftRecord>("GET", "plan-drafts/current")).toMatchObject({
      status: "failed",
      error: "AI-tjenesten kunne ikke kontaktes.",
    });
  });

  it("regenerates only unlocked days with the AI and refuses actions while generating", async () => {
    const ai = fakeAi();
    const release = ai.hold(planAnswer(dates, ["tacos", "pizza", "lasagne", "carbonara"]));
    const { json, call, deps } = setup({ openai: ai });
    const draft = await json<PlanDraftRecord>("POST", "plan-drafts", request({ engine: "ai" }));
    expect((await call("POST", `plan-drafts/${draft.id}/apply`)).status).toBe(409);
    expect((await call("POST", `plan-drafts/${draft.id}/regenerate`, {})).status).toBe(409);
    release();
    await deps.jobs.settled();
    await json("PATCH", `plan-drafts/${draft.id}/days/2026-11-09`, { locked: true });

    ai.next(planAnswer(dates.slice(1), ["frikadeller", "burgere", "laks"]));
    const regenerating = await json<PlanDraftRecord>("POST", `plan-drafts/${draft.id}/regenerate`, {});
    expect(regenerating.status).toBe("generating");
    await deps.jobs.settled();
    const done = await json<PlanDraftRecord>("GET", "plan-drafts/current");
    expect(done.status).toBe("ready");
    expect(done.days.map((d) => d.dishId)).toEqual(["tacos", "frikadeller", "burgere", "laks"]);
    expect(ai.calls[1]?.input).not.toContain('"2026-11-09"');
  });

  it("keeps the previous days when an AI regeneration fails", async () => {
    const ai = fakeAi();
    ai.next(planAnswer(dates, ["tacos", "pizza", "lasagne", "carbonara"]));
    const { json, deps } = setup({ openai: ai });
    const draft = await json<PlanDraftRecord>("POST", "plan-drafts", request({ engine: "ai" }));
    await deps.jobs.settled();
    ai.next("ikke json");
    await json("POST", `plan-drafts/${draft.id}/regenerate`, {});
    await deps.jobs.settled();
    const after = await json<PlanDraftRecord>("GET", "plan-drafts/current");
    expect(after.status).toBe("failed");
    expect(after.days.map((d) => d.dishId)).toEqual(["tacos", "pizza", "lasagne", "carbonara"]);
  });

  it("discards the result when the draft was deleted while generating", async () => {
    const ai = fakeAi();
    const release = ai.hold(planAnswer(dates, ["tacos", "pizza", "lasagne", "carbonara"]));
    const { json, call, deps } = setup({ openai: ai });
    const draft = await json<PlanDraftRecord>("POST", "plan-drafts", request({ engine: "ai" }));
    expect((await call("DELETE", `plan-drafts/${draft.id}`)).status).toBe(204);
    release();
    await deps.jobs.settled();
    expect(await json("GET", "plan-drafts/current")).toBeNull();
  });
});

describe("god tid and variants in drafts", () => {
  const son = {
    id: "son",
    name: "Oliver",
    active: true,
    exclusions: [],
    preferences: [],
    dislikes: ["oksekød"],
    safeFoods: ["nuggets"],
    favoriteDishIds: [],
  };

  it("lets slow dishes onto relaxed days only", async () => {
    const { json } = setup();
    const relaxed = "2026-11-11";
    const draft = await json<PlanDraftRecord>(
      "POST",
      "plan-drafts",
      request({ maxPrepMinutes: 30, relaxedDates: [relaxed] }),
    );
    expect(draft.request.relaxedDates).toEqual([relaxed]);
    const prep = (id: string | undefined) => DISHES.find((dish) => dish.id === id)?.prepMinutes ?? 0;
    for (const day of draft.days) if (day.date !== relaxed) expect(prep(day.dishId)).toBeLessThanOrEqual(30);
    expect(draft.review?.checks.find((check) => check.id === "prepTime")?.status).toBe("ok");
  });

  it("keeps a variant through patching and applying the draft", async () => {
    const { json } = setup();
    await json("PUT", "profiles", [son]);
    const draft = await json<PlanDraftRecord>("POST", "plan-drafts", request({ requiredDishIds: ["lasagne"] }));
    const day = draft.days.find((candidate) => candidate.dishId === "lasagne");
    expect(day?.variants).toEqual([{ profileId: "son", replaces: "hakket oksekød", with: "nuggets" }]);

    const cleared = await json<PlanDraftRecord>("PATCH", `plan-drafts/${draft.id}/days/${day?.date}`, { variants: null });
    expect(cleared.days.find((candidate) => candidate.date === day?.date)?.variants).toBeUndefined();
    const again = await json<PlanDraftRecord>("PATCH", `plan-drafts/${draft.id}/days/${day?.date}`, {
      variants: [{ profileId: "son", replaces: "oksekød", with: "nuggets" }],
    });
    expect(again.days.find((candidate) => candidate.date === day?.date)?.variants).toHaveLength(1);

    await json("POST", `plan-drafts/${draft.id}/apply`);
    const boot = await json<BootstrapResponse>("GET", "bootstrap");
    expect(boot.meals[day?.date ?? ""]?.variants).toEqual([{ profileId: "son", replaces: "hakket oksekød", with: "nuggets" }]);
    expect(boot.profiles[0]?.safeFoods).toEqual(["nuggets"]);
  });
});
