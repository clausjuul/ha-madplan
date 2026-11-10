import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import type { Context } from "hono";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

const PLACEHOLDER = `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Madplan</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#faf7f2;color:#2b2622}main{max-width:28rem;padding:1.5rem;text-align:center}</style>
</head><body><main><h1>Madplan</h1><p>Serveren kører, men appens brugerflade er ikke bygget endnu.</p><p>Byg den med <code>npm run build -w web</code>.</p></main></body></html>`;

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function cacheControl(relative: string): string {
  if (relative === "index.html") return "no-cache";
  // Vite emits content-hashed files under assets/.
  if (relative.startsWith("assets/")) return "public, max-age=31536000, immutable";
  return "public, max-age=86400";
}

/** Serves the built web app: real files as-is, extension-less paths fall back to index.html (SPA). */
export function staticHandler(webDir: string) {
  const root = normalize(webDir);
  return async (c: Context): Promise<Response> => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.text("Ugyldig adresse.", 400);
    }
    const relative = normalize(pathname.replace(/^\/+/u, "") || "index.html");
    const target = join(root, relative);
    if (target !== root && !target.startsWith(root + sep)) return c.text("Ikke fundet.", 404);

    let file = target;
    let key = relative.split(sep).join("/");
    if (!(await isFile(file))) {
      if (extname(pathname) !== "") return c.text("Ikke fundet.", 404);
      file = join(root, "index.html");
      key = "index.html";
      if (!(await isFile(file))) {
        return c.html(PLACEHOLDER, 200, { "Cache-Control": "no-cache" });
      }
    }
    const body = await readFile(file);
    return c.body(new Uint8Array(body), 200, {
      "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": cacheControl(key),
      "X-Content-Type-Options": "nosniff",
    });
  };
}
