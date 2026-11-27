/**
 * Dish photos the family uploaded (or that came from a photo of the food). They live in the database,
 * so the daily backups include them, but outside the dish itself: the dish only holds a short link
 * (`api/photos/<id>`), which keeps the bootstrap small however many photos there are.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { unprocessable } from "./errors.ts";
import { one, run } from "./repo.ts";

export const PHOTO_PATH = "api/photos/";
/** An uploaded photo as the browser sends it (downscaled to about 1000x700 before it is sent). */
export const PHOTO_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/u;
/** Generous for a downscaled JPEG (usually 100-300 kB). */
export const MAX_PHOTO_BYTES = 2_000_000;

const ID = /^[0-9a-f-]{36}$/u;

/** Stores an uploaded photo and returns the link the dish keeps. */
export function savePhoto(db: DatabaseSync, dataUrl: string, now: string): string {
  const match = PHOTO_DATA_URL.exec(dataUrl);
  if (!match) throw unprocessable("Billedet kunne ikke bruges. Prøv et andet (JPEG eller PNG).");
  const data = Buffer.from(match[2] ?? "", "base64");
  if (data.length === 0 || data.length > MAX_PHOTO_BYTES) throw unprocessable("Billedet er for stort.");
  const id = randomUUID();
  run(db, "INSERT INTO photos (id, mime, data, created_at) VALUES (?, ?, ?, ?)", id, match[1] ?? "image/jpeg", data, now);
  return `${PHOTO_PATH}${id}`;
}

export function getPhoto(db: DatabaseSync, id: string): { mime: string; data: Uint8Array } | undefined {
  if (!ID.test(id)) return undefined;
  const row = one(db, "SELECT mime, data FROM photos WHERE id = ?", id);
  if (!row || !(row.data instanceof Uint8Array) || typeof row.mime !== "string") return undefined;
  return { mime: row.mime, data: row.data };
}

/** Removes a stored photo a dish no longer uses (a link to anything else is ignored). */
export function deletePhotoAt(db: DatabaseSync, link: string | undefined): void {
  if (!link?.startsWith(PHOTO_PATH)) return;
  run(db, "DELETE FROM photos WHERE id = ?", link.slice(PHOTO_PATH.length));
}
