import fs from "node:fs";
import path from "node:path";

export type ColumnMap = Record<string, string[]>;

export type TableSchema = {
  pk?: string;
  columns: ColumnMap;
  defaults?: Record<string, any>;
};

export type DbSchema = {
  tables: Record<string, TableSchema>;
};

let cached: DbSchema | null = null;

export function loadDbSchema(): DbSchema {
  if (cached) return cached;
  const p = path.resolve(process.cwd(), "db.schema.json");
  const raw = fs.readFileSync(p, "utf-8");
  cached = JSON.parse(raw) as DbSchema;
  return cached!;
}

export function getTableSchema(table: string): TableSchema {
  const schema = loadDbSchema();
  const t = schema.tables[table];
  if (!t) throw new Error(`Table '${table}' not defined in db.schema.json`);
  return t;
}
