import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isValidTimeZone } from "./timezone.ts";

export type Config = {
  dbPath: string;
  port: number;
  openaiKey: string;
  prejKey: string;
  /** Skip the Supervisor-ingress check (development and tests only). */
  allowAnyOrigin: boolean;
  webDir: string;
  supervisorToken: string;
  /** Absolute URL prefix under which Home Assistant can reach the bundled images (optional). */
  publicImageBase: string;
  version: string;
  /** IANA zone that defines "today" (TZ env, overridden at startup by Home Assistant's own zone). */
  timeZone: string;
  planModel: string;
  discoveryModel: string;
};

/** Single source of truth: server/package.json (kept equal to madplan/config.yaml by test/version.test.ts). */
const readVersion = (): string => {
  const pkg: unknown = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
  return pkg !== null && typeof pkg === "object" && typeof (pkg as { version?: unknown }).version === "string"
    ? (pkg as { version: string }).version
    : "0.0.0";
};
const VERSION = readVersion();

type Env = Record<string, string | undefined>;

function readOptions(path: string): Record<string, unknown> {
  try {
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Add-on options come from /data/options.json; environment variables override them for development. */
export function loadConfig(env: Env = process.env, optionsPath = "/data/options.json"): Config {
  const options = readOptions(optionsPath);
  const port = Number(env.PORT ?? 8099);
  return {
    dbPath: env.MADPLAN_DB?.trim() || "/data/madplan.sqlite",
    port: Number.isInteger(port) && port > 0 ? port : 8099,
    openaiKey: clean(env.OPENAI_API_KEY) || clean(options.openai_api_key),
    prejKey: clean(env.PREJ_API_KEY) || clean(options.prej_api_key),
    allowAnyOrigin: env.MADPLAN_ALLOW_ANY_ORIGIN === "1",
    webDir:
      env.MADPLAN_WEB_DIR?.trim() || fileURLToPath(new URL("../../web/dist", import.meta.url)),
    supervisorToken: clean(env.SUPERVISOR_TOKEN),
    publicImageBase: clean(env.MADPLAN_PUBLIC_IMAGE_BASE).replace(/\/+$/u, ""),
    version: VERSION,
    timeZone: env.TZ && isValidTimeZone(env.TZ.trim()) ? env.TZ.trim() : Intl.DateTimeFormat().resolvedOptions().timeZone,
    planModel: env.MADPLAN_PLAN_MODEL?.trim() || "gpt-4.1-mini",
    discoveryModel: env.MADPLAN_DISCOVERY_MODEL?.trim() || "gpt-4.1",
  };
}
