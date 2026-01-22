"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openDb = openDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
function openDb(path) {
    const db = new better_sqlite3_1.default(path);
    db.pragma('foreign_keys = ON');
    return db;
}
