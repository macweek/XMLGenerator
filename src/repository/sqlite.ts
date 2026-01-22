import Database from "better-sqlite3";
import { loadConfig } from "../config/config";

let db: Database.Database | null = null;
export type Db = Database.Database;

export function getDb() {
  if (db) return db;

  const cfg = loadConfig();
  if (cfg.db.mode !== "sqlite-file") {
    throw new Error(`DB mode not supported by getDb(): ${cfg.db.mode}`);
  }

  db = new Database(cfg.db.path, { readonly: !!cfg.db.readonly });

  // optionnel : PRAGMA depuis config
  if (cfg.db.busyTimeoutMs) db.pragma(`busy_timeout = ${Number(cfg.db.busyTimeoutMs)}`);

  if (cfg.db.pragma && typeof cfg.db.pragma === "object") {
    for (const [k, v] of Object.entries(cfg.db.pragma)) {
      db.pragma(`${k} = ${typeof v === "string" ? `'${v}'` : v}`);
    }
  }

  return db;
}
