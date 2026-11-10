import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDailyBackup } from "../src/backup.ts";
import { loadConfig } from "../src/config.ts";
import { openDatabase } from "../src/db.ts";
import { buildEntities, createPublisher } from "../src/ha/publisher.ts";
import { fakeAi, NOW, setup } from "./helpers.ts";

type Call = { url: string; init: RequestInit };

function fakeFetch(status = 200) {
  const calls: Call[] = [];
  const impl = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(new Response("{}", { status }));
  }) as typeof fetch;
  return { calls, impl };
}

describe("Home Assistant publisher", () => {
  it("publishes tonight's dish and the open shopping count", async () => {
    const http = fakeFetch();
    const { json, deps } = setup({ fetch: http.impl, env: { SUPERVISOR_TOKEN: "tok", MADPLAN_PUBLIC_IMAGE_BASE: "http://homeassistant.local:8123/local/madplan/" } });
    await json("PUT", "meals/2026-11-09", { dishId: "lasagne" });
    await json("PUT", "meals/2026-11-10", { dishId: "tacos" });
    const entities = buildEntities(deps);
    expect(entities[0]).toMatchObject({
      entityId: "sensor.madplan_i_aften",
      state: "Lasagne",
      attributes: {
        friendly_name: "Madplan i aften",
        date: "2026-11-09",
        dish_id: "lasagne",
        icon: "mdi:silverware-fork-knife",
        entity_picture: "http://homeassistant.local:8123/local/madplan/images/dishes/lasagne.jpg",
      },
    });
    expect(entities[1]?.entityId).toBe("sensor.madplan_indkob");
    expect(Number(entities[1]?.state)).toBeGreaterThan(5);
    expect(entities[1]?.attributes).toMatchObject({ unit_of_measurement: "varer", from: "2026-11-09", to: "2026-11-10" });

    const publisher = createPublisher(deps);
    await publisher.publish(true);
    expect(http.calls.map((c) => c.url)).toEqual([
      "http://supervisor/core/api/states/sensor.madplan_i_aften",
      "http://supervisor/core/api/states/sensor.madplan_indkob",
    ]);
    expect((http.calls[0]?.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(String(http.calls[0]?.init.body))).toMatchObject({ state: "Lasagne" });
    await publisher.publish();
    expect(http.calls).toHaveLength(2);
  });

  it("says 'Ingen ret' without a meal, does nothing without a token, and survives failures", async () => {
    const http = fakeFetch();
    const noToken = setup({ fetch: http.impl });
    await createPublisher(noToken.deps).publish(true);
    expect(http.calls).toHaveLength(0);
    expect(buildEntities(noToken.deps)[0]).toMatchObject({ state: "Ingen ret" });

    const failing = setup({ fetch: () => Promise.reject(new Error("net ned")), env: { SUPERVISOR_TOKEN: "t" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(createPublisher(failing.deps).publish(true)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
    const rejected = fakeFetch(500);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await createPublisher(setup({ fetch: rejected.impl, env: { SUPERVISOR_TOKEN: "t" } }).deps).publish(true);
    quiet.mockRestore();
    expect(rejected.calls).toHaveLength(2);
  });

  it("republishes after a debounce when relevant data changes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const http = fakeFetch();
      const { json, deps } = setup({ fetch: http.impl, env: { SUPERVISOR_TOKEN: "t" } });
      const publisher = createPublisher(deps, 100);
      publisher.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(http.calls).toHaveLength(2);
      await json("PUT", "meals/2026-11-09", { dishId: "pizza" });
      await json("PUT", "meals/2026-11-09", { dishId: "tacos" });
      await vi.advanceTimersByTimeAsync(150);
      expect(http.calls.length).toBeGreaterThanOrEqual(4);
      expect(http.calls.filter((c) => c.url.endsWith("i_aften")).at(-1)?.init.body).toContain("Tacos");
      publisher.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("capabilities and config", () => {
  it("reflects configured integrations", async () => {
    const { json } = setup({ openai: fakeAi(), env: { SUPERVISOR_TOKEN: "t", PREJ_API_KEY: "k" } });
    const boot = await json<{ capabilities: unknown }>("GET", "bootstrap");
    expect(boot.capabilities).toEqual({ openai: true, homeAssistantAgent: true, offers: true });
  });

  it("reads add-on options and lets environment variables win", () => {
    const dir = mkdtempSync(join(tmpdir(), "madplan-opts-"));
    const file = join(dir, "options.json");
    writeFileSync(file, JSON.stringify({ openai_api_key: " fra-fil ", prej_api_key: "prej" }));
    expect(loadConfig({}, file)).toMatchObject({ openaiKey: "fra-fil", prejKey: "prej", port: 8099, dbPath: "/data/madplan.sqlite" });
    expect(loadConfig({ OPENAI_API_KEY: "env", PORT: "9000", MADPLAN_DB: "x.sqlite" }, file)).toMatchObject({
      openaiKey: "env",
      port: 9000,
      dbPath: "x.sqlite",
    });
    expect(loadConfig({}, join(dir, "mangler.json")).openaiKey).toBe("");
  });
});

describe("ingress guard", () => {
  const strict = () => setup({ env: { MADPLAN_ALLOW_ANY_ORIGIN: "0" } });

  it("rejects direct connections and accepts the ingress proxy", async () => {
    const { app } = strict();
    const direct = await app.request("http://localhost/api/health", {}, { incoming: { socket: { remoteAddress: "192.168.1.5" } } });
    expect(direct.status).toBe(403);
    const ingress = await app.request("http://localhost/api/health", {}, { incoming: { socket: { remoteAddress: "::ffff:172.30.32.2" } } });
    expect(ingress.status).toBe(200);
    expect((await app.request("http://localhost/api/health")).status).toBe(403);
  });

  it("refuses cross-origin requests through ingress", async () => {
    const { app } = strict();
    const env = { incoming: { socket: { remoteAddress: "172.30.32.2" } } };
    const foreign = await app.request("http://ha.local/api/meals/2026-11-10", { method: "DELETE", headers: { origin: "https://evil.example", host: "ha.local" } }, env);
    expect(foreign.status).toBe(403);
    const same = await app.request("http://ha.local/api/health", { headers: { origin: "http://ha.local", host: "ha.local" } }, env);
    expect(same.status).toBe(200);
  });
});

describe("static web", () => {
  it("serves a Danish placeholder when the web build is missing", async () => {
    const { app } = setup();
    const response = await app.request("http://localhost/uge/3");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("ikke bygget");
  });

  it("serves files, caches hashed assets, falls back to index.html for app routes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "madplan-web-"));
    mkdirSync(join(dir, "assets"));
    mkdirSync(join(dir, "images", "dishes"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<html>app</html>");
    writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)");
    writeFileSync(join(dir, "images", "dishes", "lasagne.jpg"), "jpg");
    const { app } = setup({ env: { MADPLAN_WEB_DIR: dir } });

    const index = await app.request("http://localhost/");
    expect(await index.text()).toBe("<html>app</html>");
    expect(index.headers.get("cache-control")).toBe("no-cache");
    const asset = await app.request("http://localhost/assets/app-abc123.js");
    expect(asset.headers.get("cache-control")).toContain("immutable");
    expect(asset.headers.get("content-type")).toContain("javascript");
    const image = await app.request("http://localhost/images/dishes/lasagne.jpg");
    expect(image.headers.get("content-type")).toBe("image/jpeg");
    const route = await app.request("http://localhost/shopping");
    expect(await route.text()).toBe("<html>app</html>");
    expect((await app.request("http://localhost/assets/mangler.js")).status).toBe(404);
    expect((await app.request("http://localhost/..%2f..%2fpackage.json")).status).not.toBe(200);
    expect((await app.request("http://localhost/api/ukendt")).status).toBe(404);
  });
});

describe("daily backup", () => {
  it("snapshots once per day with VACUUM INTO and keeps seven copies", () => {
    const dir = mkdtempSync(join(tmpdir(), "madplan-db-"));
    const file = join(dir, "madplan.sqlite");
    const db = openDatabase(file);
    expect(createDailyBackup(db, file, NOW)).toEqual({ created: false, reason: "empty-database" });
    db.prepare("UPDATE meta SET value = '3' WHERE key = 'revision'").run();
    db.prepare("INSERT INTO pantry (position, name) VALUES (0, 'salt')").run();

    const first = createDailyBackup(db, file, NOW, 7, "Europe/Copenhagen");
    expect(first).toMatchObject({ created: true, file: "madplan-2026-11-09.sqlite" });
    expect(createDailyBackup(db, file, NOW, 7, "Europe/Copenhagen")).toMatchObject({ created: false });
    for (let day = 10; day <= 20; day += 1) createDailyBackup(db, file, new Date(Date.UTC(2026, 10, day, 11)), 7, "Europe/Copenhagen");
    const kept = readdirSync(join(dir, "backups")).sort();
    expect(kept).toHaveLength(7);
    expect(kept.at(-1)).toBe("madplan-2026-11-20.sqlite");
    const copy = openDatabase(join(dir, "backups", "madplan-2026-11-20.sqlite"));
    expect(copy.prepare("SELECT name FROM pantry").all()).toEqual([{ name: "salt" }]);
    copy.close();
    db.close();
  });
});
