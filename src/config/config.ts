import fs from "node:fs";
import path from "node:path";

export type AppConfig = {
  env: string;
  db: any;
  schemaRegistry?: { path: string };
  meta?: { deviceXmlMetaPath: string };
};

function resolveEnvVars(value: any): any {
  if (typeof value === "string" && value.startsWith("ENV:")) {
    const k = value.slice("ENV:".length);
    return process.env[k] ?? "";
  }
  if (Array.isArray(value)) return value.map(resolveEnvVars);
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveEnvVars(v);
    return out;
  }
  return value;
}

export function loadConfig(): AppConfig {
  const cfgPath = process.env.CONFIG_PATH || path.resolve(process.cwd(), "config.json");
  const raw = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
  return resolveEnvVars(raw);
}
