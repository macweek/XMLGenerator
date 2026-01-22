"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function resolveEnvVars(value) {
    if (typeof value === "string" && value.startsWith("ENV:")) {
        const k = value.slice("ENV:".length);
        return process.env[k] ?? "";
    }
    if (Array.isArray(value))
        return value.map(resolveEnvVars);
    if (value && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value))
            out[k] = resolveEnvVars(v);
        return out;
    }
    return value;
}
function loadConfig() {
    const cfgPath = process.env.CONFIG_PATH || node_path_1.default.resolve(process.cwd(), "config.json");
    const raw = JSON.parse(node_fs_1.default.readFileSync(cfgPath, "utf-8"));
    return resolveEnvVars(raw);
}
