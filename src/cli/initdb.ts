import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "./data/app.db";
const SCHEMA_PATH = "./sql/schema.sql";
const SEED_PATH = "./sql/seed_minimal.sql";

function readFile(p: string) {
  return fs.readFileSync(p, "utf8");
}

function ensureDirForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function main() {
  ensureDirForFile(DB_PATH);

  // Re-crée une DB propre à chaque run (idéal pour tester)
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  const db = new Database(DB_PATH);

  try {
    const schema = readFile(SCHEMA_PATH);
    db.exec(schema);

    const seed = readFile(SEED_PATH);
    db.exec(seed);

    // Vérif rapide
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").all();
    console.log("✅ DB créée:", DB_PATH);
    console.log("✅ Tables:", tables.map((t: any) => t.name).join(", "));
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error("❌ initdb failed:", e);
  process.exit(1);
});
