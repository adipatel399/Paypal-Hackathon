import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { seed } from "./domain.js";
export function createStore(path, mode) {
  if (path !== ":memory:")
    mkdirSync(new URL("../.data/", import.meta.url), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS campaigns (mode TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS archives (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS webhooks (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
  );
  const read = () => {
    const row = db.prepare("SELECT data FROM campaigns WHERE mode=?").get(mode);
    return row ? JSON.parse(row.data) : null;
  };
  const save = (s) =>
    db
      .prepare(
        "INSERT INTO campaigns VALUES (?, ?) ON CONFLICT(mode) DO UPDATE SET data=excluded.data",
      )
      .run(mode, JSON.stringify(s));
  if (!read()) save(seed(mode));
  return {
    read,
    save,
    db,
    archive: (s) =>
      db
        .prepare("INSERT OR IGNORE INTO archives VALUES (?, ?)")
        .run(s.id, JSON.stringify(s)),
    webhook: (e) =>
      db
        .prepare("INSERT OR IGNORE INTO webhooks VALUES (?, ?)")
        .run(e.id, JSON.stringify(e)).changes > 0,
  };
}
