import { describe, expect, it } from "vitest";
import type { PlanDraftRecord, PlanRequest, ShoppingList } from "@madplan/domain";
import { buildEntities } from "../src/ha/publisher.ts";
import { failInterruptedDrafts, INTERRUPTED_MESSAGE } from "../src/services/drafts.ts";
import { dateKeyInZone, fetchSupervisorTimeZone, msUntilMidnightInZone } from "../src/timezone.ts";
import { loadConfig } from "../src/config.ts";
import { fakeAi, setup } from "./helpers.ts";

const LATE = new Date("2026-11-09T23:30:00Z");

describe("time zone", () => {
  it("computes date keys in the given zone, not the process zone", () => {
    expect(dateKeyInZone(LATE, "Europe/Copenhagen")).toBe("2026-11-10");
    expect(dateKeyInZone(LATE, "UTC")).toBe("2026-11-09");
    expect(dateKeyInZone(new Date("2026-07-09T22:30:00Z"), "Europe/Copenhagen")).toBe("2026-07-10");
    expect(dateKeyInZone(new Date("2026-11-10T00:00:00Z"), "America/New_York")).toBe("2026-11-09");
  });

  it("computes the midnight delay in the zone", () => {
    expect(msUntilMidnightInZone(LATE, "Europe/Copenhagen")).toBe(23.5 * 3600 * 1000);
    expect(msUntilMidnightInZone(LATE, "UTC")).toBe(30 * 60 * 1000);
    expect(msUntilMidnightInZone(new Date("2026-11-09T11:00:00.250Z"), "Europe/Copenhagen")).toBe(12 * 3600 * 1000 - 250);
  });

  it("makes the server's today, default shopping range and sensor follow the zone", async () => {
    const { json, deps } = setup({ now: LATE });
    await json("PUT", "meals/2026-11-10", { dishId: "lasagne" });
    await json("PUT", "meals/2026-11-09", { dishId: "tacos" });
    const list = await json<ShoppingList>("GET", "shopping");
    expect(list.from).toBe("2026-11-10");
    expect(list.to).toBe("2026-11-10");
    expect(buildEntities(deps)[0]).toMatchObject({ state: "Lasagne", attributes: { date: "2026-11-10" } });

    const utc = setup({ now: LATE, env: { TZ: "UTC" } });
    expect(buildEntities(utc.deps)[0]).toMatchObject({ attributes: { date: "2026-11-09" } });
  });

  it("clamps a draft window to today in the zone", async () => {
    const { json } = setup({ now: LATE });
    const request: PlanRequest = {
      engine: "local", from: "2026-11-09", dayCount: 2, skippedDates: [], newDishCount: 0,
      requiredDishIds: [], request: "", dayRequests: {}, seed: 1,
    };
    const draft = await json<PlanDraftRecord>("POST", "plan-drafts", request);
    expect(draft.days.map((d) => d.date)).toEqual(["2026-11-10", "2026-11-11"]);
  });

  it("honours TZ, falls back for invalid zones, and reads Home Assistant's zone", async () => {
    expect(loadConfig({ TZ: "Europe/Copenhagen" }, "./x.json").timeZone).toBe("Europe/Copenhagen");
    expect(loadConfig({ TZ: "Mars/Olympus" }, "./x.json").timeZone).toBeTruthy();
    const ok = (body: unknown, status = 200) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as typeof fetch;
    expect(await fetchSupervisorTimeZone("t", ok({ time_zone: "Europe/Copenhagen" }))).toBe("Europe/Copenhagen");
    expect(await fetchSupervisorTimeZone("t", ok({ time_zone: "Mars/Olympus" }))).toBeUndefined();
    expect(await fetchSupervisorTimeZone("t", ok({}, 401))).toBeUndefined();
    expect(await fetchSupervisorTimeZone("t", (() => Promise.reject(new Error("x"))) as typeof fetch)).toBeUndefined();
  });
});

describe("restart with a generating draft", () => {
  it("marks it failed on startup so the draft can be regenerated or discarded", async () => {
    const ai = fakeAi();
    ai.hold("{}");
    const { json, call, repo, deps } = setup({ openai: ai });
    const request: PlanRequest = {
      engine: "ai", from: "2026-11-09", dayCount: 3, skippedDates: [], newDishCount: 0,
      requiredDishIds: [], request: "", dayRequests: {}, seed: 1,
    };
    const draft = await json<PlanDraftRecord>("POST", "plan-drafts", request);
    expect(draft.status).toBe("generating");
    expect((await call("POST", `plan-drafts/${draft.id}/apply`)).status).toBe(409);

    // A fresh process finds the stored "generating" draft; its job is gone.
    expect(failInterruptedDrafts(repo)).toBe(1);
    const after = await json<PlanDraftRecord>("GET", "plan-drafts/current");
    expect(after).toMatchObject({ id: draft.id, status: "failed", error: INTERRUPTED_MESSAGE });
    expect(failInterruptedDrafts(repo)).toBe(0);

    ai.next(JSON.stringify({ plan: [] }));
    const again = await call("POST", `plan-drafts/${draft.id}/regenerate`, {});
    expect(again.status).toBe(200);
    expect((await call("DELETE", `plan-drafts/${draft.id}`)).status).toBe(204);
    void deps;
  });

  it("leaves ready drafts and an empty database alone", async () => {
    const { json, repo } = setup();
    expect(failInterruptedDrafts(repo)).toBe(0);
    expect(repo.revision()).toBe(0);
    await json("POST", "plan-drafts", {
      engine: "local", from: "2026-11-09", dayCount: 2, skippedDates: [], newDishCount: 0,
      requiredDishIds: [], request: "", dayRequests: {}, seed: 1,
    });
    const revision = repo.revision();
    expect(failInterruptedDrafts(repo)).toBe(0);
    expect(repo.revision()).toBe(revision);
  });
});
