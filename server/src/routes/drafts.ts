import type { Hono } from "hono";
import type { Deps } from "../deps.ts";
import { readJson, readOptionalJson } from "../http.ts";
import {
  applyDraft,
  createDraft,
  discardDraft,
  getCurrentDraft,
  patchDraftDay,
  regenerateDraft,
} from "../services/drafts.ts";
import { dateParam, draftDayPatch, planRequest } from "../validate.ts";
import { list, rec } from "../validate-basic.ts";

export function draftRoutes(api: Hono, deps: Deps): void {
  api.get("/plan-drafts/current", (c) => c.json(getCurrentDraft(deps)));

  api.post("/plan-drafts", async (c) => c.json(createDraft(deps, planRequest(await readJson(c)))));

  api.patch("/plan-drafts/:id/days/:date", async (c) => {
    const patch = draftDayPatch(await readJson(c));
    return c.json(patchDraftDay(deps, c.req.param("id"), dateParam(c.req.param("date")), patch));
  });

  api.post("/plan-drafts/:id/regenerate", async (c) => {
    const body = rec(await readOptionalJson(c), "Ønske");
    const dates =
      body.dates === undefined
        ? undefined
        : list(body.dates, "Datoer", (d) => dateParam(typeof d === "string" ? d : undefined), 60);
    return c.json(regenerateDraft(deps, c.req.param("id"), dates));
  });

  api.post("/plan-drafts/:id/apply", (c) => c.json(applyDraft(deps, c.req.param("id"))));

  api.delete("/plan-drafts/:id", (c) => {
    discardDraft(deps, c.req.param("id"));
    return c.body(null, 204);
  });
}
