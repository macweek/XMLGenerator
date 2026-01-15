import { getDb } from "../repository/sqlite";
import { getTableSchema } from "./schemaRegistry";

type Row = Record<string, any>;

function tableColumns(table: string): Set<string> {
  const db = getDb();
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return new Set(info.map((c) => String(c.name)));
}

function resolveColumn(table: string, logical: string): string | null {
  const schema = getTableSchema(table);
  const aliases = schema.columns[logical];
  if (!aliases) return null;

  const existing = tableColumns(table);
  for (const col of aliases) {
    if (existing.has(col)) return col;
  }
  return null;
}

export function selectMapped(
  table: string,
  logicalCols: string[],
  whereSql?: string,
  params: any[] = [],
  options?: {
    orderByLogical?: string[];
  }
): Row[] {
  const schema = getTableSchema(table);

  const selects: string[] = [];
  for (const logical of logicalCols) {
    const physical = resolveColumn(table, logical);
    if (physical) {
      selects.push(`${physical} as ${logical}`);
    } else if (schema.defaults && logical in schema.defaults) {
      const v = schema.defaults[logical];
      if (v === null) selects.push(`NULL as ${logical}`);
      else if (typeof v === "number") selects.push(`${v} as ${logical}`);
      else selects.push(`'${String(v).replace(/'/g, "''")}' as ${logical}`);
    } else {
      selects.push(`NULL as ${logical}`);
    }
  }

  let sql = `SELECT ${selects.join(", ")} FROM ${table}`;
  if (whereSql) sql += ` WHERE ${whereSql}`;

  // ✅ ORDER BY LOGIQUE
  if (options?.orderByLogical?.length) {
    const orderCols: string[] = [];
    for (const logical of options.orderByLogical) {
      const physical = resolveColumn(table, logical);
      if (physical) {
        orderCols.push(physical);
      }
    }
    if (orderCols.length) {
      sql += ` ORDER BY ${orderCols.join(", ")}`;
    }
  }

  const db = getDb();
  return db.prepare(sql).all(...params) as Row[];
}
