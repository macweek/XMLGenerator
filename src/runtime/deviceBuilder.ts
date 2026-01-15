/**
 * Runtime builder: construit le contexte d'appareil à partir de la DB + options
 *
 * Version (sans placement rules pour l'instant)
 *
 * - Déplie l'arbre d'instances à partir des TEMPLATE_REF.
 * - repeatCountExpr (repeat_expr en base) est interprété comme **nombre de copies supplémentaires**.
 *   => total = 1 + extra
 * - Si plusieurs TEMPLATE_REF partagent le même slotName dans un template, on leur attribue
 *   des index [0..N-1] de manière stable (ordre itemNum) pour éviter les collisions de paths.
 */

import {
  DeviceContext,
  DeviceDefinition,
  DeviceOptions,
  Globals,
  ObjectPath,
  ResolvedObject,
  TemplateInstance,
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
    placementRulesByOwner: lib.placementRulesByOwner, // peut rester chargé, juste pas utilisé

    instances: [],
    objects: [],
    objectRegistry: new Map<ObjectPath, ResolvedObject>(),
  };

  const rootTemplate = mustGet(ctx.templates, device.rootTemplateId, "rootTemplate");
  const rootInstance: TemplateInstance = {
    instanceId: safeId("root"),
    templateId: rootTemplate.id,
    path: "root",
    parentPath: null,
    instanceOrigin: vec3(0, 0, 0),
    instanceRotation: vec3(0, 0, 0),
    repeatIndex: 0,
  };

  ctx.instances.push(rootInstance);

  // Déplier l'arbre d'instances
  expandTemplateInstances(ctx, rootInstance);

  return ctx;
}

// -----------------------------
// EXPANSION: templates -> instances (paths)
// -----------------------------

/**
 * repeatCountExpr = nombre de copies supplémentaires.
 * - null/"" => 0
 * - valeur <= 0 => 0
 */
function evalRepeatExtra(
  expr: string | null | undefined,
  ctx: DeviceContext,
  parentInstance: TemplateInstance
): number {
  if (!expr) return 0;
  const s = String(expr).trim();
  if (!s) return 0;

  // IMPORTANT: ici on n'a pas encore local()/ref() (pas d'objets résolus).
  // On supporte nombres + options.* + globals.* + i
  const env = { ctx, instance: parentInstance, i: parentInstance.repeatIndex ?? 0 } as any;

  let n = 0;
  try {
    n = evalNumber(s, env);
  } catch {
    const raw = Number(s.replace(/^=/, ""));
    n = Number.isFinite(raw) ? raw : 0;
  }

  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

function expandTemplateInstances(ctx: DeviceContext, parentInstance: TemplateInstance) {
  const items = ctx.templateItemsByTemplate.get(parentInstance.templateId) ?? [];

  // Compteur par slotName, pour éviter collisions quand plusieurs TEMPLATE_REF partagent le même slotName
  const slotCounters = new Map<string, number>();

  // Stabilité: traiter les TEMPLATE_REF par itemNum croissant
  const refs = items
    .filter((it) => it.kind === "TEMPLATE_REF" && it.refTemplateId)
    .sort((a, b) => a.itemNum - b.itemNum);

  for (const it of refs) {
    const slotName = it.slotName ?? `slot_${it.itemNum}`;

    const extra = evalRepeatExtra(it.repeatCountExpr, ctx, parentInstance);
    const total = 1 + extra;

    let nextIndex = slotCounters.get(slotName) ?? 0;

    for (let k = 0; k < total; k++) {
      const slotIndex = nextIndex++;
      const childPath = `${parentInstance.path}/${slotName}[${slotIndex}]`;

      const childInstance: TemplateInstance = {
        instanceId: safeId(childPath),
        templateId: it.refTemplateId!,
        path: childPath,
        parentPath: parentInstance.path,
        instanceOrigin: vec3(0, 0, 0),
        instanceRotation: vec3(0, 0, 0),
        repeatIndex: slotIndex, // index stable dans le slot
        ...( {
          // meta pour appliquer plus tard pos/rot du TEMPLATE_REF parent
          fromParentTemplateId: parentInstance.templateId,
          fromParentPath: parentInstance.path,
          fromTemplateItemNum: it.itemNum,
          slotName,
          slotIndex,
          // index à l'intérieur de la répétition de CETTE ligne (utile si un jour tu veux i local à la ligne)
          repeatIndexInItem: k,
        } as any ),
      };

      ctx.instances.push(childInstance);

      // récursif: le sous-template peut contenir d'autres TEMPLATE_REF
      expandTemplateInstances(ctx, childInstance);
    }

    slotCounters.set(slotName, nextIndex);
  }
}

// -----------------------------
// HELPERS
// -----------------------------

function mustGet<K, V>(map: Map<K, V>, key: K, label: string): V {
  const v = map.get(key);
  if (!v) throw new Error(`Missing ${label} for key=${String(key)}`);
  return v;
}
