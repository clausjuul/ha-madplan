import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { announce, installIntegrationFiles, MARKER_FILE, setupIntegration } from "../src/ha/integration.ts";
import { createInternalApp, loadInternalToken } from "../src/internal/api.ts";
import { setup, TODAY } from "./helpers.ts";

const TOKEN = "a".repeat(64);

function internal(options: Parameters<typeof setup>[0] = {}) {
  const s = setup(options);
  const app = createInternalApp(s.deps, TOKEN, 40);
  const call = async (method: string, path: string, body?: unknown, token = TOKEN) =>
    app.request(`http://madplan:8100/internal/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const json = async <T = Record<string, unknown>>(method: string, path: string, body?: unknown, status = 200): Promise<T> => {
    const response = await call(method, path, body);
    const text = await response.text();
    if (response.status !== status) throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
    return JSON.parse(text) as T;
  };
  return { ...s, publicJson: s.json, app, call, json };
}

type Shopping = { items: { id: string; label: string; checked: boolean; extra: boolean }[] };

describe("internal API", () => {
  it("refuses requests without the right token", async () => {
    const t = internal();
    expect((await t.call("GET", "/info", undefined, "forkert")).status).toBe(401);
    expect((await t.app.request("http://madplan:8100/internal/v1/info")).status).toBe(401);
    expect(await t.json("GET", "/info")).toMatchObject({ name: "Madplan", api_version: 1 });
  });

  it("adds, ticks, renames and deletes own items", async () => {
    const t = internal();
    const added = await t.json<Shopping & { outcome: string }>("POST", "/shopping/items", { label: "Mælk" });
    expect(added.outcome).toBe("added");
    expect(added.items[0]).toMatchObject({ label: "Mælk", quantity: "" });
    const id = added.items[0]!.id;
    expect((await t.json<{ outcome: string }>("POST", "/shopping/items", { label: "mælk" })).outcome).toBe("already");

    const ticked = await t.json<Shopping>("PATCH", `/shopping/items/${encodeURIComponent(id)}`, { checked: true });
    expect(ticked.items[0]).toMatchObject({ label: "Mælk", checked: true });

    const renamed = await t.json<Shopping>("PATCH", `/shopping/items/${encodeURIComponent(id)}`, { label: "Havremælk" });
    expect(renamed.items).toHaveLength(1);
    expect(renamed.items[0]).toMatchObject({ label: "Havremælk", checked: true, extra: true });

    const newId = renamed.items[0]!.id;
    const deleted = await t.json<Shopping & { outcome: string }>("DELETE", `/shopping/items/${encodeURIComponent(newId)}`);
    expect(deleted).toMatchObject({ outcome: "removed", items: [] });
    await t.json("DELETE", `/shopping/items/${encodeURIComponent(newId)}`, undefined, 404);
  });

  it("validates input", async () => {
    const t = internal();
    await t.json("POST", "/shopping/items", { label: "" }, 400);
    await t.json("POST", "/shopping/items", { label: "Æg" });
    await t.json("PATCH", "/shopping/items/extra%3A%C3%A6g", { checked: "ja" }, 400);
    await t.json("GET", "/meals?from=2026-11-10&to=2026-11-01", undefined, 400);
    await t.json("GET", "/nope", undefined, 404);
  });

  it("lists planned meals with the dish name, and ticks a recipe item off instead of deleting it", async () => {
    const t = internal();
    await t.publicJson("PUT", "meals/2026-11-10", { dishId: "lasagne", note: "Fast" });
    const meals = await t.json<{ today: string; days: { date: string; dish: string; note: string; skipped: boolean }[] }>("GET", "/meals");
    expect(meals.today).toBe(TODAY);
    expect(meals.days).toEqual([expect.objectContaining({ date: "2026-11-10", dish_id: "lasagne", note: "Fast", skipped: false })]);
    expect(meals.days[0]!.dish).not.toBe("Ukendt ret");

    const shopping = await t.json<Shopping>("GET", "/shopping");
    const fromRecipe = shopping.items.find((item) => !item.extra)!;
    expect(fromRecipe).toBeDefined();
    await t.json("PATCH", `/shopping/items/${encodeURIComponent(fromRecipe.id)}`, { label: "Noget andet" }, 422);
    const after = await t.json<Shopping & { outcome: string }>("DELETE", `/shopping/items/${encodeURIComponent(fromRecipe.id)}`);
    expect(after.outcome).toBe("ticked");
    expect(after.items.find((item) => item.id === fromRecipe.id)?.checked).toBe(true);
  });

  it("keeps the token between restarts", () => {
    const dir = mkdtempSync(join(tmpdir(), "madplan-token-"));
    const path = join(dir, "internal-token");
    const first = loadInternalToken(path);
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(loadInternalToken(path)).toBe(first);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("integration install", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const fixture = (version: string) => {
    const root = mkdtempSync(join(tmpdir(), "madplan-int-"));
    dirs.push(root);
    const source = join(root, "source");
    mkdirSync(join(source, "__pycache__"), { recursive: true });
    writeFileSync(join(source, "manifest.json"), JSON.stringify({ domain: "madplan", version }));
    writeFileSync(join(source, "__init__.py"), "# madplan\n");
    writeFileSync(join(source, "__pycache__", "x.pyc"), "");
    const config = join(root, "config");
    mkdirSync(config);
    return { source, config, target: join(config, "custom_components", "madplan") };
  };

  it("installs, leaves an equal version alone and updates another", () => {
    const f = fixture("1.0.0");
    expect(installIntegrationFiles(f.config, f.source)).toBe("installed");
    expect(existsSync(join(f.target, MARKER_FILE))).toBe(true);
    expect(existsSync(join(f.target, "__pycache__"))).toBe(false);
    expect(installIntegrationFiles(f.config, f.source)).toBe("unchanged");
    writeFileSync(join(f.source, "manifest.json"), JSON.stringify({ domain: "madplan", version: "1.1.0" }));
    expect(installIntegrationFiles(f.config, f.source)).toBe("updated");
    expect(readFileSync(join(f.target, "manifest.json"), "utf8")).toContain("1.1.0");
  });

  it("never touches a copy without our marker", () => {
    const f = fixture("1.0.0");
    mkdirSync(f.target, { recursive: true });
    writeFileSync(join(f.target, "manifest.json"), JSON.stringify({ domain: "madplan", version: "0.1.0" }));
    expect(installIntegrationFiles(f.config, f.source)).toBe("kept");
    expect(readFileSync(join(f.target, "manifest.json"), "utf8")).toContain("0.1.0");
  });

  it("announces host, port and token through Supervisor discovery", async () => {
    const calls: { url: string; body?: unknown }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
      if (url.endsWith("/addons/self/info")) return new Response(JSON.stringify({ result: "ok", data: { hostname: "c5393445-madplan" } }));
      return new Response(JSON.stringify({ result: "ok", data: { uuid: "x" } }));
    }) as unknown as typeof fetch;
    await announce(fetcher, "sup", 8100, TOKEN);
    expect(calls[1]).toEqual({
      url: "http://supervisor/discovery",
      body: { service: "madplan", config: { host: "c5393445-madplan", port: 8100, token: TOKEN } },
    });
  });

  it("asks for a restart after installing and does nothing when switched off", async () => {
    const f = fixture("1.0.0");
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ result: "ok", data: { hostname: "local-madplan" } }));
    }) as unknown as typeof fetch;
    const config = { supervisorToken: "sup", haConfigDir: f.config, haIntegration: true, internalPort: 8100 };
    await setupIntegration({ ...config, haIntegration: false }, TOKEN, fetcher, f.source);
    expect(urls).toEqual([]);
    expect(existsSync(f.target)).toBe(false);
    await setupIntegration(config, TOKEN, fetcher, f.source);
    expect(urls).toContain("http://supervisor/core/api/services/persistent_notification/create");
    expect(urls).toContain("http://supervisor/discovery");
  });
});
