"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectMapped = selectMapped;
const sqlite_1 = require("../repository/sqlite");
const schemaRegistry_1 = require("./schemaRegistry");
function tableColumns(table) {
    const db = (0, sqlite_1.getDb)();
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    return new Set(info.map((c) => String(c.name)));
}
function resolveColumn(table, logical) {
    const schema = (0, schemaRegistry_1.getTableSchema)(table);
    const aliases = schema.columns[logical];
    if (!aliases)
        return null;
    const existing = tableColumns(table);
    for (const col of aliases) {
        if (existing.has(col))
            return col;
    }
    return null;
}
function selectMapped(table, logicalCols, whereSql, params = [], options) {
    const schema = (0, schemaRegistry_1.getTableSchema)(table);
    const selects = [];
    for (const logical of logicalCols) {
        const physical = resolveColumn(table, logical);
        if (physical) {
            selects.push(`${physical} as ${logical}`);
        }
        else if (schema.defaults && logical in schema.defaults) {
            const v = schema.defaults[logical];
            if (v === null)
                selects.push(`NULL as ${logical}`);
            else if (typeof v === "number")
                selects.push(`${v} as ${logical}`);
            else
                selects.push(`'${String(v).replace(/'/g, "''")}' as ${logical}`);
        }
        else {
            selects.push(`NULL as ${logical}`);
        }
    }
    let sql = `SELECT ${selects.join(", ")} FROM ${table}`;
    if (whereSql)
        sql += ` WHERE ${whereSql}`;
    // ✅ ORDER BY LOGIQUE
    if (options?.orderByLogical?.length) {
        const orderCols = [];
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
    const db = (0, sqlite_1.getDb)();
    return db.prepare(sql).all(...params);
}
