/**
 * Runtime builder: construit le contexte d'appareil à partir de la DB + options
 *
 * Ce fichier fait:
 * 1) charge les templates/items/objectDefs/rules (via repositories)
 * 2) instancie le template racine (et ses sous-templates) => arbre d'instances (paths)
 * 3) applique les placement rules sur les slots répétitifs (LINEAR/STACK pour MVP)
 *
 * Ne fait PAS encore:
 * - résolution complète des expressions ref("...") (fichier 4)
 * - normalisation ancre (fichier 5)
 * - génération XML (fichier 6)
 */

import {
  DeviceContext,
  DeviceDefinition,
  DeviceOptions,
  Globals,
  InstancePath,
  ObjectPath,
  PlacementRule,
  ResolvedObject,
  Template,
  TemplateInstance,
  TemplateItem,
  Vec3,
} from "../types/core";

import { loadLibraryForDevice } from "../repository/libraryRepository";
import { safeId } from "./utils";
import { evalNumber } from "./expressionEvaluator";
/** Valeurs par défaut si rien en DB */
function defaultGlobals(): Globals {
  return {};
}

function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

/**
 * Construit le DeviceContext (sans encore résoudre les expressions de positions/params)
 */
export async function buildDeviceContext(
  device: DeviceDefinition,
  options: DeviceOptions
): Promise<DeviceContext> {
  // 1) Charger toute la "library" nécessaire (templates, items, defs, rules, globals...)
  const lib = await loadLibraryForDevice(device);

  const globals: Globals = {
    ...defaultGlobals(),
    ...(lib.globals ?? {}),
    ...(device.overridesJson ?? {}),
  } as Globals;

  const ctx: DeviceContext = {
    device,
    options,
    globals,

    templates: lib.templates,
    templateItemsByTemplate: lib.templateItemsByTemplate,
    objectDefs: lib.objectDefs,
    placementRulesByOwner: lib.placementRulesByOwner,

    instances: [],
    objects: [],
    objectRegistry: new Map<ObjectPath, ResolvedObject>(),
  };

  // 2) Instancier template racine en "root"
  const rootTemplate = mustGet(ctx.templates, device.rootTemplateId, "rootTemplate");
  const rootInstance: TemplateInstance = {
    instanceId: safeId("root"),
    templateId: rootTemplate.id,
    path: "root",
    parentPath: null,
    instanceOrigin: vec3(0, 0, 0),
    instanceRotation: vec3(0, 0, 0),
  };

  ctx.instances.push(rootInstance);

  // 3) Déplier les sous-templates (instances) - MVP: expansion structurée, sans calculs
  expandTemplateInstances(ctx, rootInstance);

  // 5) Pour l’instant on ne résout pas les objets finaux (positions/params),
  //    ça sera dans le fichier 4 + 5 (expressions + anchor).
  //    Ici on se contente de préparer les instances avec des transforms propres.

  return ctx;
}

// -----------------------------
// EXPANSION: templates -> instances (paths)
// -----------------------------
function evalRepeatCount(expr: string | null | undefined, ctx: DeviceContext, parentInstance: TemplateInstance): number {
  if (!expr) return 0;
  const s = expr.trim();
  if (!s) return 0;

  // Important: à ce stade, PAS de local()/ref()
  // On évalue seulement options/globals/nombres
 const env = { ctx, instance: parentInstance, i: 0 } as any; // dummy instance (pas utilisée)

  let n=0;
  try {
    n = evalNumber(s, env as any);
  } catch {
    // fallback number
    const raw = Number(s.replace(/^=/, ""));
    n = Number.isFinite(raw) ? raw : 0;
  }

  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function expandTemplateInstances(ctx: DeviceContext, parentInstance: TemplateInstance) {
  const items = ctx.templateItemsByTemplate.get(parentInstance.templateId) ?? [];

  for (const it of items) {
    if (it.kind !== "TEMPLATE_REF") continue;
    if (!it.refTemplateId) continue;

    const slotName = it.slotName ?? `slot_${it.itemNum}`;
    //const repeatCount = parseRepeatCount(it.repeatCountExpr);
    const extra = evalRepeatCount(it.repeatCountExpr, ctx, parentInstance);
    const total = 1 + extra;

    for (let i = 0; i < total; i++) {
      const childPath = `${parentInstance.path}/${slotName}[${i}]`;
      const childInstance: TemplateInstance = {
        
        instanceId: safeId(childPath),
        templateId: it.refTemplateId,
        path: childPath,
        parentPath: parentInstance.path,
        instanceOrigin: vec3(0, 0, 0), // sera déplacé par placement rules
        instanceRotation: vec3(0, 0, 0),
        // ✅ mémoriser de quel TEMPLATE_REF on vient
        // (on évaluera plus tard les pos/rot expr quand local() sera disponible)
        ...( {
          repeatIndex: i,
          fromParentTemplateId: parentInstance.templateId,
          fromParentPath: parentInstance.path,
          fromTemplateItemNum: it.itemNum,
          slotName,
          slotIndex: i,
        } as any )
      };

      ctx.instances.push(childInstance);

      // récursif: le sous-template peut contenir d'autres TEMPLATE_REF
      expandTemplateInstances(ctx, childInstance);
    }
  }
}

function parseRepeatCount(expr?: string | null): number {
  // MVP: si vide => 1 ; si nombre => ce nombre.
  // Plus tard: expr peut être "options.nbModules" évalué par expressionEvaluator.
  if (!expr) return 1;
  const s = expr.trim().replace(/^=/, "");
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 1;
}

// -----------------------------
// PLACEMENT RULES: modifies instance transforms
// -----------------------------
/*
export function applyPlacementRules(ctx: DeviceContext) {
  for (const [ownerTemplateId, rules] of ctx.placementRulesByOwner.entries()) {
    const ownerInstances = ctx.instances.filter((ins) => ins.templateId === ownerTemplateId);
    if (ownerInstances.length === 0) continue;

    for (const ownerIns of ownerInstances) {
      applyRulesInOwnerInstance(ctx, ownerIns, rules);
    }
  }
}

function applyRulesInOwnerInstance(ctx: DeviceContext, ownerIns: TemplateInstance, rules: PlacementRule[]) {
  const sorted = [...rules].sort((a, b) => a.orderIndex - b.orderIndex);

  for (const rule of sorted) {
    const slotPrefix = `${ownerIns.path}/${rule.targetSlotName}[`;
    const targets = ctx.instances
      .filter((ins) => ins.path.startsWith(slotPrefix))
      .sort((a, b) => getIndexFromPath(a.path) - getIndexFromPath(b.path));

    if (targets.length === 0) continue;

    switch (rule.ruleType) {
      case "LINEAR":
      case "STACK":
        applyLinearLike(ctx, targets, rule);
        break;
      default:
        break;
    }
  }
}


function applyLinearLike(ctx: DeviceContext, targets: TemplateInstance[], rule: PlacementRule) {
  const axis = rule.axis ?? (rule.ruleType === "STACK" ? "Z" : "X");
  const dir = rule.direction ?? 1;

  // start pour i=0
  const env0: any = { ctx, instance: targets[0], i: 0, prevInstancePath: null };
  const start = rule.startOffsetExpr ? evalNumber(rule.startOffsetExpr, env0) : 0;

  // startRot simple (si tu veux aussi des expressions plus tard, on l’étendra)
  const startRot = parseVec3Expr(rule.startRotExpr);

  // ⚠️ ne pas écraser une base pos éventuelle : on ajoute start au premier
  setAxis(targets[0].instanceOrigin, axis, getAxis(targets[0].instanceOrigin, axis) + start);
  targets[0].instanceRotation = addVec3(targets[0].instanceRotation, startRot);

  for (let i = 1; i < targets.length; i++) {
    const prev = targets[i - 1];
    const cur = targets[i];

    const env: any = { ctx, instance: cur, i, prevInstancePath: prev.path };

    const spacing = rule.spacingExpr ? evalNumber(rule.spacingExpr, env) : 0;

    const prevVal = getAxis(prev.instanceOrigin, axis);
    setAxis(cur.instanceOrigin, axis, prevVal + dir * spacing);

    cur.instanceRotation = addVec3(cur.instanceRotation, startRot);
  }
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}


function getAxis(v: Vec3, axis: "X" | "Y" | "Z"): number {
  if (axis === "X") return v.x;
  if (axis === "Y") return v.y;
  return v.z;
}

function setAxis(v: Vec3, axis: "X" | "Y" | "Z", value: number) {
  if (axis === "X") v.x = value;
  else if (axis === "Y") v.y = value;
  else v.z = value;
}

function getIndexFromPath(path: InstancePath): number {
  // ".../slotName[12]" => 12
  const m = path.match(/\[(\d+)\]$/);
  return m ? Number(m[1]) : 0;
}
*/
// -----------------------------
// HELPERS
// -----------------------------

function mustGet<K, V>(map: Map<K, V>, key: K, label: string): V {
  const v = map.get(key);
  if (!v) throw new Error(`Missing ${label} for key=${String(key)}`);
  return v;
}

function parseVec3Expr(expr?: string | null): { x: number; y: number; z: number } {
  if (!expr) return { x: 0, y: 0, z: 0 };
  const s = expr.trim().replace(/^=/, "");
  const parts = s.split(/[;,]/).map(p => p.trim()).filter(Boolean);
  const x = Number(parts[0] ?? 0);
  const y = Number(parts[1] ?? 0);
  const z = Number(parts[2] ?? 0);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    z: Number.isFinite(z) ? z : 0,
  };
}
