import { Hono } from "hono";
import type { Context } from "hono";
import type { Deps } from "./deps.ts";
import { HttpError } from "./errors.ts";
import { assistRoutes } from "./routes/assist.ts";
import { dataRoutes } from "./routes/data.ts";
import { discoveryRoutes } from "./routes/discovery.ts";
import { dishRoutes } from "./routes/dishes.ts";
import { draftRoutes } from "./routes/drafts.ts";
import { householdRoutes } from "./routes/household.ts";
import { mealRoutes } from "./routes/meals.ts";
import { offerRoutes } from "./routes/offers.ts";
import { shoppingRoutes } from "./routes/shopping.ts";
import { weeklyRoutes } from "./routes/weekly.ts";
import { ingressGuard } from "./security.ts";
import { staticHandler } from "./static.ts";

export type AppOptions = { pingMs?: number };

export function createApp(deps: Deps, options: AppOptions = {}): Hono {
  const app = new Hono();
  app.use("*", ingressGuard(deps.config));

  const api = new Hono();
  api.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    await next();
  });
  dataRoutes(api, deps, options.pingMs);
  mealRoutes(api, deps);
  dishRoutes(api, deps);
  shoppingRoutes(api, deps);
  householdRoutes(api, deps);
  draftRoutes(api, deps);
  discoveryRoutes(api, deps);
  weeklyRoutes(api, deps);
  assistRoutes(api, deps);
  offerRoutes(api, deps);
  api.all("*", (c) => c.json({ error: "not_found", message: "Endepunktet findes ikke." }, 404));
  app.route("/api", api);

  const serveStatic = staticHandler(deps.config.webDir);
  app.get("*", (c) => serveStatic(c));

  app.onError((error: Error, c: Context) => {
    if (error instanceof HttpError) return c.json(error.toBody(), error.status);
    console.error("unhandled error", error);
    return c.json({ error: "internal", message: "Der skete en uventet fejl på serveren." }, 500);
  });
  return app;
}
