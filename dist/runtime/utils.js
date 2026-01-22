"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeId = safeId;
const node_crypto_1 = __importDefault(require("node:crypto"));
/** ID stable-ish à partir d'une string */
function safeId(seed) {
    return node_crypto_1.default.createHash("sha1").update(seed).digest("hex").slice(0, 12);
}
