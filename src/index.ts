import { loadDeviceDefinition } from "./repository/deviceRepository";
import { buildDeviceContext, /*applyPlacementRules*/ } from "./runtime/deviceBuilder";
import { resolveTemplateObjects } from "./runtime/expressionEvaluator";
import { applyTemplateRefInstanceTransforms, applyAnchorAndInstanceTransforms } from "./runtime/anchorResolver";
import { generateXml } from "./xml/xmlGenerator";
import fs from "node:fs";
import path from "node:path";

// Charger un meta optionnel DeviceXmlMeta.json (tolérant si absent)
let meta: any = {};
try {
  const metaPath = path.resolve(process.cwd(), "DeviceXmlMeta.json");
  if (fs.existsSync(metaPath)) {
    const raw = fs.readFileSync(metaPath, "utf-8");
    try {
      meta = JSON.parse(raw);
    } catch (err) {
      console.warn("⚠�� DeviceXmlMeta.json existe mais n'est pas un JSON valide, utilisation d'un meta vide", err);
      meta = {};
    }
  } else {
    console.warn(`⚠️ DeviceXmlMeta.json introuvable à ${metaPath}, utilisation d'un meta vide`);
  }
} catch (err) {
  console.warn("⚠️ Impossible de lire DeviceXmlMeta.json, utilisation d'un meta vide", err);
  meta = {};
}

type DeviceOptions = Record<string, boolean | number | string>;

function parseArgs(): { morphoCode: string; options: DeviceOptions } {
  const [, , morphoCode, ...rest] = process.argv;
  if (!morphoCode) throw new Error("Code morphologique manquant");

  const options: DeviceOptions = {};
  for (const arg of rest) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=");
    if (rawValue === undefined) options[key] = true;
    else if (rawValue === "true" || rawValue === "false") options[key] = rawValue === "true";
    else if (!isNaN(Number(rawValue))) options[key] = Number(rawValue);
    else options[key] = rawValue;
  }
  return { morphoCode, options };
}

async function main() {
  const { morphoCode, options } = parseArgs();

  const deviceDef = await loadDeviceDefinition(morphoCode);
  const ctx = await buildDeviceContext(deviceDef, options);

  // 1) objets + registry (local/ref possible)
  resolveTemplateObjects(ctx);

  // 2) pos/rot du TEMPLATE_REF vers les instances enfants (Point B)
  applyTemplateRefInstanceTransforms(ctx);

  // 3) placement rules (ref(prev/1) possible car registry existe)
  //applyPlacementRules(ctx);

  // 4) anchor + world transforms
  applyAnchorAndInstanceTransforms(ctx);

  // 5) XML
  const xml = generateXml(ctx, meta);
  console.log(xml);
}

main().catch((err) => {
  console.error("❌ Erreur génération appareil");
  console.error(err);
  process.exit(1);
});