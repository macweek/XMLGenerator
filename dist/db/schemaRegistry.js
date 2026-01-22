"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDbSchema = loadDbSchema;
exports.getTableSchema = getTableSchema;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
let cached = null;
function loadDbSchema() {
    if (cached)
        return cached;
    const p = node_path_1.default.resolve(process.cwd(), "db.schema.json");
    const raw = node_fs_1.default.readFileSync(p, "utf-8");
    cached = JSON.parse(raw);
    return cached;
}
function getTableSchema(table) {
    const schema = loadDbSchema();
    const t = schema.tables[table];
    if (!t)
        throw new Error(`Table '${table}' not defined in db.schema.json`);
    return t;
}
