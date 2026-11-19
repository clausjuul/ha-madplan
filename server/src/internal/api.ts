/**
 * Internal API for the bundled Home Assistant integration (custom_components/madplan).
 *
 * It runs on its own port that is only reachable on the Supervisor's internal network (not listed under
 * `ports:` in config.yaml), next to the ingress UI whose guard stays untouched. Every request needs the
 * app's own random token, which reaches Home Assistant through Supervisor discovery.
 *
 * Versioned under /internal/v1: fields may be added, never removed or changed, so an integration that
 * is older than the app (Home Assistant not restarted yet) keeps working.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Hono } from "hono";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { addDaysToKey, formatQuantity } from "@madplan/domain";
import type { ChangeEvent } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { HttpError, badRequest } from "../errors.ts";
import { readJson } from "../http.ts";
import { PING_INTERVAL_MS } from "../routes/data.ts";
import { addItems, deleteItem, renameItem, setItemChecked } from "../services/shopping-edit.ts";
import { currentShoppingList, snapshot } from "../state.ts";
import { dateParam } from "../validate.ts";
import { rec, str } from "../validate-basic.ts";

export const INTERNAL_API_VERSION = 1;
const UNKNOWN_QUANTITY = formatQuantity(undefined, undefined);
const MAX_RANGE_DAYS = 400;

/** Reads the token from `path`, creating a new random one (owner-only file) the first time. */
export function loadInternalToken(path: string): string {
  if (existsSync(path)) {
    const token = readFileSync(path, "utf8").trim();
    if (token.length >= 32) return token;
  }
  const token = randomBytes(32).toString("hex");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  return token;
}

const sameToken = (given: string, expected: string): boolean => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

function shoppingBody(deps: Deps) {
  const list = currentShoppingList(deps);
  return {
    from: list.from,
    to: list.to,
    items: list.items.map((item) => ({
      id: item.id,
      label: item.label,
      // "Mængde ikke angivet" is for the shopping screen; a to-do description is better left empty.
      quantity: item.quantityLabel === UNKNOWN_QUANTITY ? "" : item.quantityLabel,
      dishes: item.dishNames,
      category: item.category,
      extra: item.extra,
      checked: item.checked,
    })),
  };
}

function mealsBody(deps: Deps, fromRaw: string | undefined, toRaw: string | undefined) {
  const state = snapshot(deps);
  const from = fromRaw === undefined ? addDaysToKey(state.today, -7) : dateParam(fromRaw);
  const to = toRaw === undefined ? addDaysToKey(state.today, 60) : dateParam(toRaw);
  if (to < from) throw badRequest("Slutdatoen ligger før startdatoen.");
  if (addDaysToKey(from, MAX_RANGE_DAYS) < to) throw badRequest(`Højst ${MAX_RANGE_DAYS} dage ad gangen.`);
  const dishes = new Map(state.dishes.map((dish) => [dish.id, dish]));
  const days = Object.entries(state.meals)
    .filter(([date]) => date >= from && date <= to)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, meal]) => {
      const dish = dishes.get(meal.dishId);
      return {
        date,
        dish_id: meal.dishId,
        dish: dish?.name ?? "Ukendt ret",
        prep_minutes: dish?.prepMinutes ?? null,
        note: meal.note,
        skipped: meal.skipped === true,
      };
    });
  return { today: state.today, from, to, days };
}

export function createInternalApp(deps: Deps, token: string, pingMs = PING_INTERVAL_MS): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!given || !sameToken(given, token)) {
      console.warn("Afviste et kald til Madplans interne API med forkert nøgle.");
      return c.json({ error: "unauthorized", message: "Forkert nøgle." }, 401);
    }
    c.header("Cache-Control", "no-store");
    await next();
  });

  const v1 = new Hono();
  v1.get("/info", (c) => c.json({ name: "Madplan", version: deps.config.version, api_version: INTERNAL_API_VERSION }));
  v1.get("/shopping", (c) => c.json(shoppingBody(deps)));
  v1.post("/shopping/items", async (c) => {
    const body = rec(await readJson(c), "Vare");
    const label = str(body.label, "Varenavn", { min: 1, max: 100 });
    const [outcome] = addItems(deps, [label]);
    return c.json({ outcome, ...shoppingBody(deps) });
  });
  v1.patch("/shopping/items/:id", async (c) => {
    let id = c.req.param("id");
    const body = rec(await readJson(c), "Vare");
    if (body.checked !== undefined && typeof body.checked !== "boolean") throw badRequest("checked skal være true eller false.");
    if (body.label !== undefined) id = renameItem(deps, id, str(body.label, "Varenavn", { min: 1, max: 100 }));
    if (typeof body.checked === "boolean") setItemChecked(deps, id, body.checked);
    return c.json(shoppingBody(deps));
  });
  v1.delete("/shopping/items/:id", (c) => {
    const outcome = deleteItem(deps, c.req.param("id"));
    return c.json({ outcome, ...shoppingBody(deps) });
  });
  v1.get("/meals", (c) => c.json(mealsBody(deps, c.req.query("from"), c.req.query("to"))));
  v1.get("/events", (c) =>
    streamSSE(c, async (stream) => {
      let open = true;
      const unsubscribe = deps.repo.onChange((event: ChangeEvent) => {
        if (open) void stream.writeSSE({ event: "change", data: JSON.stringify(event) }).catch(() => undefined);
      });
      const timer = setInterval(() => {
        if (open) void stream.write(": ping\n\n").catch(() => undefined);
      }, pingMs);
      const stop = (): void => {
        open = false;
        clearInterval(timer);
        unsubscribe();
      };
      stream.onAbort(stop);
      await stream.write(": connected\n\n");
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      stop();
    }),
  );
  v1.all("*", (c) => c.json({ error: "not_found", message: "Endepunktet findes ikke." }, 404));
  app.route("/internal/v1", v1);
  app.all("*", (c) => c.json({ error: "not_found", message: "Endepunktet findes ikke." }, 404));

  app.onError((error: Error, c: Context) => {
    if (error instanceof HttpError) return c.json(error.toBody(), error.status);
    console.error("Fejl i Madplans interne API", error);
    return c.json({ error: "internal", message: "Der skete en uventet fejl i Madplan." }, 500);
  });
  return app;
}
