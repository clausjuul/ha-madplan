import { chmodSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { dateKeyInZone } from "./timezone.ts";
import { one, text } from "./repo.ts";

const NAME = /^madplan-\d{4}-\d{2}-\d{2}\.sqlite$/u;
export const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type BackupResult =
  | { created: boolean; file: string; retained: number }
  | { created: false; reason: "empty-database" };

/**
 * One WAL-safe snapshot per local day (SQLite VACUUM INTO) under <db dir>/backups, newest `keep` retained.
 * Errors propagate to the caller, which logs them; a backup never replaces the database.
 */
export function createDailyBackup(db: DatabaseSync, dbFile: string, now = new Date(), keep = 7, timeZone = "UTC"): BackupResult {
  const dir = join(dirname(resolve(dbFile)), "backups");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (Number(text(one(db, "SELECT value FROM meta WHERE key = 'revision'") ?? {}, "value")) === 0) {
    return { created: false, reason: "empty-database" };
  }
  const file = `madplan-${dateKeyInZone(now, timeZone)}.sqlite`;
  const destination = join(dir, file);
  let created = false;
  if (!existsSync(destination)) {
    // The file name is generated from a date; no user input reaches this SQL.
    db.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
    try {
      chmodSync(destination, 0o600);
    } catch {
      // best effort (not supported everywhere)
    }
    created = true;
  }
  const files = readdirSync(dir).filter((name) => NAME.test(name)).sort().reverse();
  for (const name of files.slice(Math.max(1, keep))) unlinkSync(join(dir, name));
  return { created, file, retained: Math.min(files.length, Math.max(1, keep)) };
}
