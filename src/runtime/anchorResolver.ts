/**
 * Anchor normalization + applying instance transforms
 *
 * Objectif:
 * - Respecter la règle: "un objet complexe (template) prend comme repère le premier objet simple"
 * - Donc, pour chaque instance de template:
 *    1) trouver l'anchor item (template.anchorItemNum ou premier OBJECT)
 *    2) recentrer tous les objets de cette instance pour que l'anchor soit (0,0,0) (et optionnel: rot=0)
 *    3) appliquer le transform d'instance (instanceOrigin + instanceRotation)
 *
 * Note:
 * - On travaille sur ctx.objects (ResolvedObject) créés au fichier 4.
 * - ctx.instances contient l'arbre d'instances et leur transform (placement rules).
 */
import { TemplateInstance } from "../types/core";

import { mat4FromTR_XYZ, mat4ApplyToPoint, addEuler, mat4Identity, mat4Mul,Mat4 } from "./transform";
import {  DeviceContext, ResolvedObject, Template, TemplateItem, Vec3,} from "../types/core";
import { evalNumber } from "./expressionEvaluator";


// -----------------------------
// Public API
// -----------------------------

export function applyTemplateRefInstanceTransforms(ctx: DeviceContext): void {
  // index instances by path
  const byPath = new Map(ctx.instances.map(i => [i.path, i]));

  for (const child of ctx.instances) {
    const parentPath = child.parentPath;
    if (!parentPath) continue;

    const meta = (child as any);
    if (!meta.fromParentTemplateId || !meta.fromTemplateItemNum) continue;

    const parent = byPath.get(parentPath);
    if (!parent) continue;

    const parentItems = ctx.templateItemsByTemplate.get(meta.fromParentTemplateId) ?? [];
    const it = parentItems.find(x => x.itemNum === meta.fromTemplateItemNum);
    if (!it) continue;

    // On ne traite que les TEMPLATE_REF
    if (it.kind !== "TEMPLATE_REF") continue;

    const env = { ctx, instance: parent };

    const dx = evalNumber(it.posXExpr ?? "0", env as any);
    const dy = evalNumber(it.posYExpr ?? "0", env as any);
    const dz = evalNumber(it.posZExpr ?? "0", env as any);

    const rx = evalNumber(it.rotXExpr ?? "0", env as any);
    const ry = evalNumber(it.rotYExpr ?? "0", env as any);
    const rz = evalNumber(it.rotZExpr ?? "0", env as any);

    // ✅ incrémentation du child transform
    child.instanceOrigin.x += dx;
    child.instanceOrigin.y += dy;
    child.instanceOrigin.z += dz;

    child.instanceRotation.x += rx;
    child.instanceRotation.y += ry;
    child.instanceRotation.z += rz;
  }
}
export function applyAnchorAndInstanceTransforms(ctx: DeviceContext): void {
  // Grouper les objets par instancePath: "root/modules[0]" etc.
  const objectsByInstance = groupByInstancePath(ctx.objects);

  for (const instance of ctx.instances) {
    const instanceObjects = objectsByInstance.get(instance.path);
    if (!instanceObjects || instanceObjects.length === 0) continue;

    const template = mustGet(ctx.templates, instance.templateId, "Template");
    const templateItems = ctx.templateItemsByTemplate.get(template.id) ?? [];

    const anchorItemNum = resolveAnchorItemNum(template, templateItems);
    const anchorObj = instanceObjects.find(o => o.itemNum === anchorItemNum);

    // Si pas d'ancre trouvée, on ne recentre pas (cas rare)
    const anchorOrigin = anchorObj ? anchorObj.origin : { x: 0, y: 0, z: 0 };
    const anchorRotation = anchorObj ? anchorObj.rotation : { x: 0, y: 0, z: 0 };

  
   // 1) Normalisation anchor (recenter)
 //    - on recadre toujours l'origine sur l'ancre
 //    - on ne touche aux rotations QUE si template.normalizeAnchorRot === 1
const normalizeRot = (template as any).normalizeAnchorRot === 1;

for (const obj of instanceObjects) {
  obj.origin = subVec(obj.origin, anchorOrigin);

  if (normalizeRot) {
    obj.rotation = subVec(obj.rotation, anchorRotation);
  }
}


  // 2) Appliquer transform d'instance (rotation X->Y->Z puis translation)
const M = computeWorldMatrix(ctx, instance);
const worldRot = computeWorldEuler(ctx, instance);

for (const obj of instanceObjects) {
  obj.origin = mat4ApplyToPoint(M, obj.origin);
  obj.rotation = addEuler(obj.rotation, worldRot);
}

  }

  // 3) Recalculer parentNum si tu veux lier en dur (MVP: parentNum reste -1)
  //    Optionnel: si tu veux map parentItemNum => parentNum numérique, on peut ajouter ici.
}

// -----------------------------
// Anchor selection
// -----------------------------

function resolveAnchorItemNum(template: Template, items: TemplateItem[]): number {
  if (template.anchorItemNum && template.anchorItemNum > 0) return template.anchorItemNum;

  // sinon: premier OBJECT par itemNum croissant
  const first = [...items]
    .filter(i => i.kind === "OBJECT")
    .sort((a, b) => a.itemNum - b.itemNum)[0];

  return first ? first.itemNum : 1;
}

// -----------------------------
// Grouping helpers
// -----------------------------

function groupByInstancePath(objects: ResolvedObject[]): Map<string, ResolvedObject[]> {
  const map = new Map<string, ResolvedObject[]>();
  for (const o of objects) {
    const instancePath = getInstancePath(o.objectPath);
    const arr = map.get(instancePath) ?? [];
    arr.push(o);
    map.set(instancePath, arr);
  }
  return map;
}

function getInstancePath(objectPath: string): string {
  // objectPath: "root/modules[0]/2" => instancePath = "root/modules[0]"
  const idx = objectPath.lastIndexOf("/");
  if (idx <= 0) return "root";
  return objectPath.slice(0, idx);
}

// -----------------------------
// Vector math
// -----------------------------


function subVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}


// -----------------------------
// Helpers
// -----------------------------

function mustGet<K, V>(map: Map<K, V>, key: K, label: string): V {
  const v = map.get(key);
  if (!v) throw new Error(`Missing ${label} for key=${String(key)}`);
  return v;
}
function computeWorldMatrix(ctx: DeviceContext, ins: TemplateInstance): Mat4 {
  const byPath = new Map(ctx.instances.map(i => [i.path, i]));
  let cur: TemplateInstance | undefined = ins;
  let M = mat4Identity();

  // On accumule de root -> enfant
  const chain: TemplateInstance[] = [];
  while (cur) {
    chain.push(cur);
    cur = cur.parentPath ? byPath.get(cur.parentPath) : undefined;
  }
  chain.reverse();

  for (const node of chain) {
    const Ml = mat4FromTR_XYZ(node.instanceOrigin, node.instanceRotation);
    M = mat4Mul(M, Ml); // ✅ world = parent * local
  }
  return M;
}

function computeWorldEuler(ctx: DeviceContext, ins: TemplateInstance): Vec3 {
  const byPath = new Map(ctx.instances.map(i => [i.path, i]));
  let cur: TemplateInstance | undefined = ins;

  const chain: TemplateInstance[] = [];
  while (cur) {
    chain.push(cur);
    cur = cur.parentPath ? byPath.get(cur.parentPath) : undefined;
  }
  chain.reverse();

  let r: Vec3 = { x: 0, y: 0, z: 0 };
  for (const node of chain) {
    r = addEuler(r, node.instanceRotation);
  }
  return r;
}
