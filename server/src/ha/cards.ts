/**
 * Dashboard cards: copies madplan-cards.js and the bundled dish photos into Home Assistant's
 * www folder (served as /local/madplan/...), registers the card as a Lovelace resource and
 * looks up the app's own ingress path for the embedded web card. Every step is best-effort.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config.ts";

export const CARDS_FILE = fileURLToPath(new URL("../../assets/madplan-cards.js", import.meta.url));
export const LOCAL_BASE = "/local/madplan";

/** Copies the card and the dish photos to <config>/www/madplan. Returns false when the folder is not mapped. */
export function installCardFiles(config: Pick<Config, "haConfigDir" | "webDir">, cardsFile = CARDS_FILE): boolean {
  if (!existsSync(config.haConfigDir)) return false;
  const target = join(config.haConfigDir, "www", "madplan");
  mkdirSync(target, { recursive: true });
  copyFileSync(cardsFile, join(target, "madplan-cards.js"));
  const images = join(config.webDir, "images", "dishes");
  if (existsSync(images)) cpSync(images, join(target, "images", "dishes"), { recursive: true });
  return true;
}

export const resourceUrl = (version: string): string => `${LOCAL_BASE}/madplan-cards.js?v=${encodeURIComponent(version)}`;

type WsMessage = { id?: number; type: string; success?: boolean; result?: unknown; error?: { message?: string } };

/** Minimal Home Assistant WebSocket session through the Supervisor proxy. */
async function withCoreSocket<T>(token: string, work: (call: (msg: Record<string, unknown>) => Promise<unknown>) => Promise<T>, url = "ws://supervisor/core/websocket"): Promise<T> {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout mod Home Assistant")), 10_000);
    socket.addEventListener("error", () => reject(new Error("WebSocket-fejl")));
    socket.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as WsMessage;
      if (msg.type === "auth_required") socket.send(JSON.stringify({ type: "auth", access_token: token }));
      else if (msg.type === "auth_ok") {
        clearTimeout(timer);
        resolve();
      } else if (msg.type === "auth_invalid") reject(new Error("Home Assistant afviste token"));
      else if (msg.type === "result" && msg.id !== undefined) {
        const waiter = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.success) waiter?.resolve(msg.result);
        else waiter?.reject(new Error(msg.error?.message ?? "ukendt fejl"));
      }
    });
  });
  try {
    await ready;
    return await work(
      (msg) =>
        new Promise((resolve, reject) => {
          const id = nextId++;
          pending.set(id, { resolve, reject });
          socket.send(JSON.stringify({ ...msg, id }));
        }),
    );
  } finally {
    socket.close();
  }
}

type Resource = { id: string; url: string; type: string };

/** Adds (or updates the version of) the card resource. Dashboards in YAML mode refuse this; the log says what to add. */
export async function registerCardResource(token: string, version: string): Promise<"created" | "updated" | "unchanged"> {
  const url = resourceUrl(version);
  return withCoreSocket(token, async (call) => {
    const resources = (await call({ type: "lovelace/resources" })) as Resource[];
    const existing = resources.find((resource) => resource.url.split("?")[0] === `${LOCAL_BASE}/madplan-cards.js`);
    if (existing?.url === url) return "unchanged";
    if (existing) {
      await call({ type: "lovelace/resources/update", resource_id: existing.id, res_type: "module", url });
      return "updated";
    }
    await call({ type: "lovelace/resources/create", res_type: "module", url });
    return "created";
  });
}

/** The app's ingress path, e.g. "/api/hassio_ingress/abc123/". */
export async function fetchIngressUrl(token: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl("http://supervisor/addons/self/info", {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return "";
  const body = (await response.json()) as { data?: { ingress_url?: unknown } };
  return typeof body.data?.ingress_url === "string" ? body.data.ingress_url : "";
}

/** Startup wiring: install files, point entity pictures at /local, find the ingress path, register the resource. */
export async function setupCards(config: Config): Promise<void> {
  try {
    if (installCardFiles(config)) {
      if (!config.publicImageBase) config.publicImageBase = LOCAL_BASE;
      console.log(`Dashboard-kort installeret i ${join(config.haConfigDir, "www", "madplan")}`);
    } else {
      console.warn(`Home Assistant-konfigurationsmappen (${config.haConfigDir}) er ikke tilgængelig; dashboard-kort installeres ikke.`);
      return;
    }
  } catch (error) {
    console.error("Kunne ikke installere dashboard-kort", error);
    return;
  }
  if (!config.supervisorToken) return;
  try {
    config.ingressUrl = await fetchIngressUrl(config.supervisorToken);
  } catch (error) {
    console.warn("Kunne ikke læse appens ingress-adresse", error);
  }
  try {
    const outcome = await registerCardResource(config.supervisorToken, config.version);
    if (outcome !== "unchanged") console.log(`Dashboard-ressource ${outcome === "created" ? "tilføjet" : "opdateret"}: ${resourceUrl(config.version)}`);
  } catch (error) {
    console.warn(
      `Kunne ikke registrere dashboard-ressourcen automatisk (${error instanceof Error ? error.message : String(error)}). ` +
        `Tilføj den selv under Indstillinger -> Dashboards -> Ressourcer: ${LOCAL_BASE}/madplan-cards.js (JavaScript-modul).`,
    );
  }
}
