"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const DB_PATH = process.env.DB_PATH || "./data/app.db";
const SCHEMA_PATH = "./sql/schema.sql";
const SEED_PATH = "./sql/seed_minimal.sql";
function readFile(p) {
    return node_fs_1.default.readFileSync(p, "utf8");
}
function ensureDirForFile(filePath) {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(filePath), { recursive: true });
}
async function main() {
    ensureDirForFile(DB_PATH);
    // Re-crée une DB propre à chaque run (idéal pour tester)
    if (node_fs_1.default.existsSync(DB_PATH))
        node_fs_1.default.unlinkSync(DB_PATH);
    const db = new better_sqlite3_1.default(DB_PATH);
    try {
        const schema = readFile(SCHEMA_PATH);
        db.exec(schema);
        const seed = readFile(SEED_PATH);
        db.exec(seed);
        // Vérif rapide
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").all();
        console.log("✅ DB créée:", DB_PATH);
        console.log("✅ Tables:", tables.map((t) => t.name).join(", "));
    }
    finally {
        db.close();
    }
}
main().catch((e) => {
    console.error("❌ initdb failed:", e);
    process.exit(1);
});
