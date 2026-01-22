"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const deviceRepository_1 = require("./repository/deviceRepository");
const deviceBuilder_1 = require("./runtime/deviceBuilder");
const expressionEvaluator_1 = require("./runtime/expressionEvaluator");
const anchorResolver_1 = require("./runtime/anchorResolver");
const xmlGenerator_1 = require("./xml/xmlGenerator");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const metaPath = node_path_1.default.resolve(process.cwd(), "DeviceXmlMeta.json");
const meta = JSON.parse(node_fs_1.default.readFileSync(metaPath, "utf-8"));
function parseArgs() {
    const [, , morphoCode, ...rest] = process.argv;
    if (!morphoCode)
        throw new Error("Code morphologique manquant");
    const options = {};
    for (const arg of rest) {
        if (!arg.startsWith("--"))
            continue;
        const [key, rawValue] = arg.slice(2).split("=");
        if (rawValue === undefined)
            options[key] = true;
        else if (rawValue === "true" || rawValue === "false")
            options[key] = rawValue === "true";
        else if (!isNaN(Number(rawValue)))
            options[key] = Number(rawValue);
        else
            options[key] = rawValue;
    }
    return { morphoCode, options };
}
async function main() {
    const { morphoCode, options } = parseArgs();
    const deviceDef = await (0, deviceRepository_1.loadDeviceDefinition)(morphoCode);
    const ctx = await (0, deviceBuilder_1.buildDeviceContext)(deviceDef, options);
    // 1) objets + registry (local/ref possible)
    (0, expressionEvaluator_1.resolveTemplateObjects)(ctx);
    // 2) pos/rot du TEMPLATE_REF vers les instances enfants (Point B)
    (0, anchorResolver_1.applyTemplateRefInstanceTransforms)(ctx);
    // 3) placement rules (ref(prev/1) possible car registry existe)
    //applyPlacementRules(ctx);
    // 4) anchor + world transforms
    (0, anchorResolver_1.applyAnchorAndInstanceTransforms)(ctx);
    // 5) XML
    const xml = (0, xmlGenerator_1.generateXml)(ctx, meta);
    console.log(xml);
}
main().catch((err) => {
    console.error("❌ Erreur génération appareil");
    console.error(err);
    process.exit(1);
});
