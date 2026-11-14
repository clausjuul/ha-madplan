import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Ordered, append-only schema migrations. Never edit an applied entry; add a new one. */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT INTO meta (key, value) VALUES ('revision', '0');

  CREATE TABLE meals (
    date TEXT PRIMARY KEY,
    dish_id TEXT NOT NULL,
    locked INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    reason TEXT,
    offer TEXT,
    skipped INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE dishes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    servings REAL,
    prep_minutes REAL NOT NULL,
    category TEXT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0,
    leftover_friendly INTEGER NOT NULL DEFAULT 0,
    freezer_friendly INTEGER NOT NULL DEFAULT 0,
    image_key TEXT,
    image_url TEXT,
    source_url TEXT,
    instructions TEXT,
    custom INTEGER NOT NULL DEFAULT 0,
    generated INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT
  );

  CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    active INTEGER NOT NULL,
    exclusions TEXT NOT NULL,
    preferences TEXT NOT NULL,
    dislikes TEXT NOT NULL,
    favorite_dish_ids TEXT NOT NULL,
    portions REAL
  );

  CREATE TABLE fridge_items (
    position INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    quantity TEXT,
    expires_on TEXT,
    use_first INTEGER
  );

  CREATE TABLE pantry (position INTEGER PRIMARY KEY, name TEXT NOT NULL);

  CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);

  CREATE TABLE shopping_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    checked TEXT NOT NULL,
    extras TEXT NOT NULL
  );

  CREATE TABLE plan_drafts (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    engine TEXT NOT NULL,
    request TEXT NOT NULL,
    days TEXT NOT NULL,
    review TEXT,
    error TEXT
  );

  CREATE TABLE saved_inspirations (
    position INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL
  );

  CREATE TABLE discoveries (
    identity TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    name TEXT NOT NULL,
    seen_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE assist_proposals (
    id TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE meals ADD COLUMN rating TEXT;
  `,
  `
  CREATE TABLE assist_undo (
    id TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE meals ADD COLUMN variants TEXT;
  ALTER TABLE profiles ADD COLUMN safe_foods TEXT;
  `,
  `
  CREATE TABLE retail_offers (
    chain TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    json TEXT NOT NULL,
    valid_until TEXT NOT NULL,
    PRIMARY KEY (chain, product_id)
  );
  CREATE TABLE offer_sync (
    chain TEXT PRIMARY KEY,
    synced_on TEXT,
    synced_at TEXT,
    as_of TEXT,
    count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    error_on TEXT
  );
  CREATE TABLE prej_calls (
    day TEXT PRIMARY KEY,
    calls INTEGER NOT NULL DEFAULT 0,
    remaining INTEGER
  );
  `,
];

export function migrate(db: DatabaseSync): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
  const current = typeof row?.version === "number" ? row.version : 0;
  for (let version = current + 1; version <= MIGRATIONS.length; version += 1) {
    const sql = MIGRATIONS[version - 1];
    if (sql === undefined) continue;
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        version,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

/** Opens (and migrates) the database. Use ":memory:" for tests. */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}
