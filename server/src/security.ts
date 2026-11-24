import type { MiddlewareHandler } from "hono";
import type { Config } from "./config.ts";

/** The Supervisor's ingress proxy always connects from this address. */
export const INGRESS_ADDRESS = "172.30.32.2";

type NodeBindings = { incoming?: { socket?: { remoteAddress?: string } } };

/**
 * Production: only the Home Assistant ingress proxy may talk to the app, and cross-origin
 * writes are refused. MADPLAN_ALLOW_ANY_ORIGIN=1 switches both off for development.
 */
export function ingressGuard(config: Pick<Config, "allowAnyOrigin">): MiddlewareHandler {
  return async (c, next) => {
    if (config.allowAnyOrigin) return next();
    const env = c.env as NodeBindings | undefined;
    const remote = (env?.incoming?.socket?.remoteAddress ?? "").replace(/^::ffff:/u, "");
    if (remote !== INGRESS_ADDRESS) {
      return c.json({ error: "forbidden", message: "Appen kan kun åbnes via Home Assistant." }, 403);
    }
    if (!isSameOriginWrite(c.req.method, (name) => c.req.header(name))) {
      return c.json({ error: "forbidden", message: "Forespørgsler fra andre sider er ikke tilladt." }, 403);
    }
    return next();
  };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cross-site request protection for writes. Reads change nothing and pass: browsers send an
 * Origin header even on same-origin `crossorigin` script and stylesheet loads, and behind a
 * second reverse proxy (e.g. a kiosk app serving HA on 127.0.0.1) that origin never matches
 * the Host Home Assistant forwards, which used to block the app's own files (blank page).
 * For writes the browser's Sec-Fetch-Site decides when present; older browsers fall back to
 * comparing Origin with the forwarded host.
 */
export function isSameOriginWrite(method: string, header: (name: string) => string | undefined): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  const site = header("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = header("origin");
  if (!origin) return true;
  let host = "";
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  return host !== "" && [header("host"), header("x-forwarded-host")].includes(host);
}
