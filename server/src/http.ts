import type { Context } from "hono";
import { badRequest, HttpError } from "./errors.ts";

export const MAX_BODY_BYTES = 1_000_000;
export const MAX_IMPORT_BYTES = 20_000_000;

export async function readJson(c: Context, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > maxBytes) throw new HttpError(413, "too_large", "Forespørgslen er for stor.");
  const raw = await c.req.text();
  if (raw.length > maxBytes) throw new HttpError(413, "too_large", "Forespørgslen er for stor.");
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("Forespørgslen indeholder ikke gyldig JSON.");
  }
}

/** Like readJson, but an empty body is `{}` (for POSTs whose body is optional). */
export async function readOptionalJson(c: Context): Promise<unknown> {
  const raw = await c.req.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("Forespørgslen indeholder ikke gyldig JSON.");
  }
}
