"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const config_1 = require("../config/config");
let db = null;
function getDb() {
    if (db)
        return db;
    const cfg = (0, config_1.loadConfig)();
    if (cfg.db.mode !== "sqlite-file") {
        throw new Error(`DB mode not supported by getDb(): ${cfg.db.mode}`);
    }
    db = new better_sqlite3_1.default(cfg.db.path, { readonly: !!cfg.db.readonly });
    // optionnel : PRAGMA depuis config
    if (cfg.db.busyTimeoutMs)
        db.pragma(`busy_timeout = ${Number(cfg.db.busyTimeoutMs)}`);
    if (cfg.db.pragma && typeof cfg.db.pragma === "object") {
        for (const [k, v] of Object.entries(cfg.db.pragma)) {
            db.pragma(`${k} = ${typeof v === "string" ? `'${v}'` : v}`);
        }
    }
    return db;
}
