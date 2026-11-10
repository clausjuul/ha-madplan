import { describe, expect, it } from "vitest";
import { createFakeClient } from "../src/api/fake-client";
import { engineLabel, summarizeDraft } from "../src/lib/draft-summary";
import { initialForm, toRequest } from "../src/lib/plan-form";

const TODAY = "2026-11-09";

const request = (engine: "ai" | "local", extra = {}) => ({
  ...toRequest(initialForm(TODAY, [], true), TODAY, []),
  engine,
  seed: 7,
  ...extra,
});

describe("engine labelling", () => {
  it("never presents the local engine as AI", () => {
    expect(engineLabel("ai")).toBe("Lavet af Assist med websøgning");
    expect(engineLabel("local")).toBe("Hurtigt forslag ud fra jeres retter");
    expect(engineLabel("local")).not.toMatch(/assist|ai/iu);
  });
});

describe("draft summary", () => {
  it("counts dishes, new dishes, average time and shopping from the draft days alone", async () => {
    const client = createFakeClient({ today: TODAY, openai: true });
    const data = await client.bootstrap();
    const draft = await client.createDraft(request("local", { newDishCount: 0 }));
    expect(draft.status).toBe("ready");
    const summary = summarizeDraft(draft, data, TODAY);
    expect(summary.dishCount).toBe(7);
    expect(summary.estimatedCostDkk).toBeGreaterThan(0);
    const minutes = draft.days.map((day) => data.dishes.find((dish) => dish.id === day.dishId)?.prepMinutes ?? 0);
    expect(summary.averageMinutes).toBe(Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length));
    expect(summary.newDishCount).toBe(0);
    expect(summarizeDraft({ days: [] }, data, TODAY)).toEqual({ dishCount: 0, newDishCount: 0, estimatedCostDkk: 0, averageMinutes: null });
  });
});

describe("fake plan drafts", () => {
  it("plans locally at once, keeps the locked meal and offers one current draft", async () => {
    const client = createFakeClient({ today: TODAY });
    expect(await client.currentDraft()).toBeNull();
    const draft = await client.createDraft(request("local"));
    expect(draft).toMatchObject({ status: "ready", engine: "local" });
    expect(draft.days.map((day) => day.date)).toHaveLength(7);
    const friday = draft.days.find((day) => day.date === "2026-11-13");
    expect(friday).toMatchObject({ locked: true, dishId: "pizza" });
    expect((await client.currentDraft())?.id).toBe(draft.id);
  });

  it("locks, regenerates only unlocked days, picks a dish and applies", async () => {
    const client = createFakeClient({ today: TODAY });
    const draft = await client.createDraft(request("local"));
    const locked = await client.patchDraftDay(draft.id, "2026-11-10", { locked: true });
    const lockedDish = locked.days.find((day) => day.date === "2026-11-10")?.dishId;
    const redone = await client.regenerateDraft(draft.id, ["2026-11-11"]);
    expect(redone.days.find((day) => day.date === "2026-11-10")?.dishId).toBe(lockedDish);
    expect(redone.days.find((day) => day.date === "2026-11-11")?.dishId).not.toBe(draft.days.find((day) => day.date === "2026-11-11")?.dishId);
    await expect(client.regenerateDraft(draft.id, ["2026-11-10"])).rejects.toMatchObject({ status: 409 });

    const picked = await client.patchDraftDay(draft.id, "2026-11-12", { dishId: "tacos" });
    expect(picked.days.find((day) => day.date === "2026-11-12")).toMatchObject({ dishId: "tacos", source: "manual" });

    const { meals } = await client.applyDraft(draft.id);
    expect(meals["2026-11-12"]?.dishId).toBe("tacos");
    expect(meals["2026-11-13"]?.dishId).toBe("pizza");
    expect((await client.bootstrap()).meals["2026-11-12"]?.dishId).toBe("tacos");
    expect(await client.currentDraft()).toBeNull();
  });

  it("refuses an impossible request with the Danish feasibility message", async () => {
    const client = createFakeClient({ today: TODAY });
    await expect(client.createDraft(request("local", { dayCount: 2, newDishCount: 3 }))).rejects.toMatchObject({ status: 422 });
  });

  it("AI demo goes generating then ready, can be discarded, and fails on demand", async () => {
    const client = createFakeClient({ today: TODAY, openai: true, aiDelayMs: 20 });
    const generating = await client.createDraft(request("ai"));
    expect(generating.status).toBe("generating");
    await new Promise((resolve) => setTimeout(resolve, 60));
    const ready = await client.currentDraft();
    expect(ready).toMatchObject({ status: "ready", engine: "ai" });
    expect(ready?.days.some((day) => day.reason.startsWith("Demo"))).toBe(true);
    await client.discardDraft(generating.id);
    expect(await client.currentDraft()).toBeNull();

    await client.createDraft(request("ai", { request: "[demo-fejl]" }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await client.currentDraft()).toMatchObject({ status: "failed" });
  });

  it("refuses AI planning without the capability", async () => {
    const client = createFakeClient({ today: TODAY });
    await expect(client.createDraft(request("ai"))).rejects.toMatchObject({ status: 503 });
  });
});
