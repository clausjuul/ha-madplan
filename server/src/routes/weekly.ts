import type { Hono } from "hono";
import type { Deps } from "../deps.ts";
import { weeklyPlans } from "../weekly/service.ts";

export function weeklyRoutes(api: Hono, deps: Deps): void {
  api.get("/weekly-plans", async (c) => c.json(await weeklyPlans(deps, { refresh: c.req.query("refresh") === "1" })));
}
