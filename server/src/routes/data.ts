import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ChangeEvent, ExportFile } from "@madplan/domain";
import type { Deps } from "../deps.ts";
import { MAX_IMPORT_BYTES, readJson } from "../http.ts";
import { importV1 } from "../services/import-v1.ts";
import { bootstrap, todayKey } from "../state.ts";

export const PING_INTERVAL_MS = 25_000;

export function dataRoutes(api: Hono, deps: Deps, pingMs = PING_INTERVAL_MS): void {
  api.get("/health", (c) => c.json({ ok: true as const, version: deps.config.version }));

  api.get("/bootstrap", (c) => c.json(bootstrap(deps)));

  api.post("/import/v1", async (c) => c.json(importV1(deps, await readJson(c, MAX_IMPORT_BYTES))));

  api.get("/export", (c) => {
    const { revision: _revision, capabilities: _capabilities, isEmpty: _isEmpty, ...data } = bootstrap(deps);
    const file: ExportFile = {
      format: "madplan-export",
      version: 2,
      exportedAt: deps.now().toISOString(),
      data,
    };
    c.header("Content-Disposition", `attachment; filename="madplan-export-${todayKey(deps)}.json"`);
    return c.json(file);
  });

  api.get("/events", (c) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
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
    });
  });
}
