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
    const origin = c.req.header("origin");
    if (origin) {
      let host = "";
      try {
        host = new URL(origin).host;
      } catch {
        // falls through to the refusal below
      }
      const allowed = [c.req.header("host"), c.req.header("x-forwarded-host")];
      if (!host || !allowed.includes(host)) {
        return c.json({ error: "forbidden", message: "Forespørgsler fra andre sider er ikke tilladt." }, 403);
      }
    }
    return next();
  };
}
