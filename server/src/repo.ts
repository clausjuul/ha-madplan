import type { DatabaseSync, SQLInputValue, SQLOutputValue } from "node:sqlite";
import type { ChangeEvent, ChangeTopic } from "@madplan/domain";

export type Row = Record<string, SQLOutputValue>;

export const all = (db: DatabaseSync, sql: string, ...params: SQLInputValue[]): Row[] =>
  db.prepare(sql).all(...params);

export const one = (db: DatabaseSync, sql: string, ...params: SQLInputValue[]): Row | undefined =>
  db.prepare(sql).get(...params);

export const run = (db: DatabaseSync, sql: string, ...params: SQLInputValue[]): void => {
  db.prepare(sql).run(...params);
};

export const text = (row: Row, key: string): string => {
  const value = row[key];
  return typeof value === "string" ? value : "";
};
export const optText = (row: Row, key: string): string | undefined => {
  const value = row[key];
  return typeof value === "string" ? value : undefined;
};
export const numeric = (row: Row, key: string): number => {
  const value = row[key];
  return typeof value === "number" ? value : typeof value === "bigint" ? Number(value) : 0;
};
export const optNumeric = (row: Row, key: string): number | undefined => {
  const value = row[key];
  return typeof value === "number" ? value : typeof value === "bigint" ? Number(value) : undefined;
};
export const flag = (row: Row, key: string): boolean => numeric(row, key) !== 0;

export function parseJson<T>(row: Row, key: string, fallback: T): T {
  const raw = row[key];
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const toJson = (value: unknown): string => JSON.stringify(value);

/**
 * Owns the connection and the single write path. Every mutation runs through `mutate`: one transaction,
 * the revision is bumped inside it, and the change event is published only after COMMIT.
 */
export class Repo {
  readonly db: DatabaseSync;
  private listeners = new Set<(event: ChangeEvent) => void>();

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  revision(): number {
    const row = one(this.db, "SELECT value FROM meta WHERE key = 'revision'");
    return row ? Number(text(row, "value")) : 0;
  }

  onChange(listener: (event: ChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  mutate<T>(topics: readonly ChangeTopic[], work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    let result: T;
    let revision: number;
    try {
      result = work();
      revision = this.revision() + 1;
      run(this.db, "UPDATE meta SET value = ? WHERE key = 'revision'", String(revision));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    const event: ChangeEvent = { revision, topics: [...new Set(topics)] };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("change listener failed", error);
      }
    }
    return result;
  }

  /** True when the household has never stored anything (offers the v1 import). */
  isEmpty(): boolean {
    const tables = ["meals", "dishes", "profiles", "fridge_items", "pantry", "saved_inspirations"];
    return tables.every((table) => numeric(one(this.db, `SELECT COUNT(*) AS n FROM ${table}`) ?? {}, "n") === 0);
  }
}
