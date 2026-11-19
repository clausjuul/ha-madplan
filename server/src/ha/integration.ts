/**
 * The bundled Home Assistant integration (integration/custom_components/madplan): copies it into Home
 * Assistant's custom_components, tells the user to restart when the files changed, and announces the
 * internal API through Supervisor discovery so Home Assistant offers "Madplan fundet" with one click.
 *
 * A copy without our marker file (e.g. installed through HACS or edited by hand) is never touched, and
 * `ha_integration: false` stops both the copying and the announcement. Every step is best-effort.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config.ts";

export const INTEGRATION_SOURCE = fileURLToPath(new URL("../../../integration/custom_components/madplan", import.meta.url));
export const MARKER_FILE = ".installed-by-madplan";
const SUPERVISOR = "http://supervisor";

export type InstallOutcome = "installed" | "updated" | "unchanged" | "kept" | "unavailable";

const manifestVersion = (dir: string): string | undefined => {
  try {
    const data = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { version?: unknown };
    return typeof data.version === "string" ? data.version : undefined;
  } catch {
    return undefined;
  }
};

/** Copies the integration into <config>/custom_components/madplan when ours is missing or another version. */
export function installIntegrationFiles(haConfigDir: string, source = INTEGRATION_SOURCE): InstallOutcome {
  if (!existsSync(haConfigDir) || !existsSync(source)) return "unavailable";
  const target = join(haConfigDir, "custom_components", "madplan");
  const existed = existsSync(target);
  if (existed && !existsSync(join(target, MARKER_FILE))) return "kept";
  const wanted = manifestVersion(source);
  if (existed && wanted !== undefined && manifestVersion(target) === wanted) return "unchanged";
  if (existed) rmSync(target, { recursive: true, force: true });
  cpSync(source, target, {
    recursive: true,
    filter: (path) => !path.includes("__pycache__"),
  });
  writeFileSync(
    join(target, MARKER_FILE),
    "Installeret af Madplan-appen og opdateres af den. Slet denne fil, hvis du vil beholde din egen udgave.\n",
  );
  return existed ? "updated" : "installed";
}

type Fetcher = typeof fetch;

async function supervisor(fetcher: Fetcher, token: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetcher(`${SUPERVISOR}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json().catch(() => ({}));
}

/** Announces host, port and token to Home Assistant (repeating it is harmless: Supervisor keeps one). */
export async function announce(fetcher: Fetcher, token: string, port: number, internalToken: string): Promise<void> {
  const info = (await supervisor(fetcher, token, "/addons/self/info")) as { data?: { hostname?: unknown } };
  const host = info.data?.hostname;
  if (typeof host !== "string" || !host) throw new Error("Supervisor oplyste ikke appens værtsnavn");
  await supervisor(fetcher, token, "/discovery", { service: "madplan", config: { host, port, token: internalToken } });
}

async function notifyRestart(fetcher: Fetcher, token: string, outcome: "installed" | "updated"): Promise<void> {
  await supervisor(fetcher, token, "/core/api/services/persistent_notification/create", {
    notification_id: "madplan_integration",
    title: "Madplan",
    message:
      outcome === "installed"
        ? "Madplan har installeret sin integration (indkøbsliste som to-do-liste og madplanen som kalender). **Genstart Home Assistant** under Indstillinger → System, og tilføj derefter Madplan, når den dukker op under Indstillinger → Enheder og tjenester."
        : "Madplans integration er opdateret. **Genstart Home Assistant** under Indstillinger → System for at tage den nye udgave i brug.",
  });
}

/** Startup wiring; never throws. */
export async function setupIntegration(
  config: Pick<Config, "supervisorToken" | "haConfigDir" | "haIntegration" | "internalPort">,
  internalToken: string,
  fetcher: Fetcher = fetch,
  source = INTEGRATION_SOURCE,
): Promise<void> {
  if (!config.supervisorToken || !config.haIntegration) return;
  try {
    const outcome = installIntegrationFiles(config.haConfigDir, source);
    if (outcome === "installed" || outcome === "updated") {
      console.log(outcome === "installed" ? "Home Assistant-integrationen er installeret." : "Home Assistant-integrationen er opdateret.");
      await notifyRestart(fetcher, config.supervisorToken, outcome).catch((error: unknown) =>
        console.warn("Kunne ikke vise besked om genstart", error instanceof Error ? error.message : error),
      );
    } else if (outcome === "kept") {
      console.log("custom_components/madplan er din egen udgave; Madplan lader den være.");
    }
  } catch (error) {
    console.warn("Kunne ikke installere Home Assistant-integrationen", error instanceof Error ? error.message : error);
  }
  try {
    await announce(fetcher, config.supervisorToken, config.internalPort, internalToken);
  } catch (error) {
    console.warn("Kunne ikke melde Madplan til Home Assistant (discovery)", error instanceof Error ? error.message : error);
  }
}
