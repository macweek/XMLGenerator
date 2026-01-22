"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyTemplateRefInstanceTransforms = applyTemplateRefInstanceTransforms;
exports.applyAnchorAndInstanceTransforms = applyAnchorAndInstanceTransforms;
const transform_1 = require("./transform");
const expressionEvaluator_1 = require("./expressionEvaluator");
// -----------------------------
// Public API
// -----------------------------
function applyTemplateRefInstanceTransforms(ctx) {
    // index instances by path
    const byPath = new Map(ctx.instances.map(i => [i.path, i]));
    for (const child of ctx.instances) {
        const parentPath = child.parentPath;
        if (!parentPath)
            continue;
        const meta = child;
        if (!meta.fromParentTemplateId || !meta.fromTemplateItemNum)
            continue;
        const parent = byPath.get(parentPath);
        if (!parent)
            continue;
        const parentItems = ctx.templateItemsByTemplate.get(meta.fromParentTemplateId) ?? [];
        const it = parentItems.find(x => x.itemNum === meta.fromTemplateItemNum);
        if (!it)
            continue;
        // On ne traite que les TEMPLATE_REF
        if (it.kind !== "TEMPLATE_REF")
            continue;
        const env = { ctx, instance: parent };
        const dx = (0, expressionEvaluator_1.evalNumber)(it.posXExpr ?? "0", env);
        const dy = (0, expressionEvaluator_1.evalNumber)(it.posYExpr ?? "0", env);
        const dz = (0, expressionEvaluator_1.evalNumber)(it.posZExpr ?? "0", env);
        const rx = (0, expressionEvaluator_1.evalNumber)(it.rotXExpr ?? "0", env);
        const ry = (0, expressionEvaluator_1.evalNumber)(it.rotYExpr ?? "0", env);
        const rz = (0, expressionEvaluator_1.evalNumber)(it.rotZExpr ?? "0", env);
        // ✅ incrémentation du child transform
        child.instanceOrigin.x += dx;
        child.instanceOrigin.y += dy;
        child.instanceOrigin.z += dz;
        child.instanceRotation.x += rx;
        child.instanceRotation.y += ry;
        child.instanceRotation.z += rz;
    }
}
function applyAnchorAndInstanceTransforms(ctx) {
    // Grouper les objets par instancePath: "root/modules[0]" etc.
    const objectsByInstance = groupByInstancePath(ctx.objects);
    for (const instance of ctx.instances) {
        const instanceObjects = objectsByInstance.get(instance.path);
        if (!instanceObjects || instanceObjects.length === 0)
            continue;
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
        const normalizeRot = template.normalizeAnchorRot === 1;
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
            obj.origin = (0, transform_1.mat4ApplyToPoint)(M, obj.origin);
            obj.rotation = (0, transform_1.addEuler)(obj.rotation, worldRot);
        }
    }
    // 3) Recalculer parentNum si tu veux lier en dur (MVP: parentNum reste -1)
    //    Optionnel: si tu veux map parentItemNum => parentNum numérique, on peut ajouter ici.
}
// -----------------------------
// Anchor selection
// -----------------------------
function resolveAnchorItemNum(template, items) {
    if (template.anchorItemNum && template.anchorItemNum > 0)
        return template.anchorItemNum;
    // sinon: premier OBJECT par itemNum croissant
    const first = [...items]
        .filter(i => i.kind === "OBJECT")
        .sort((a, b) => a.itemNum - b.itemNum)[0];
    return first ? first.itemNum : 1;
}
// -----------------------------
// Grouping helpers
// -----------------------------
function groupByInstancePath(objects) {
    const map = new Map();
    for (const o of objects) {
        const instancePath = getInstancePath(o.objectPath);
        const arr = map.get(instancePath) ?? [];
        arr.push(o);
        map.set(instancePath, arr);
    }
    return map;
}
function getInstancePath(objectPath) {
    // objectPath: "root/modules[0]/2" => instancePath = "root/modules[0]"
    const idx = objectPath.lastIndexOf("/");
    if (idx <= 0)
        return "root";
    return objectPath.slice(0, idx);
}
// -----------------------------
// Vector math
// -----------------------------
function subVec(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
// -----------------------------
// Helpers
// -----------------------------
function mustGet(map, key, label) {
    const v = map.get(key);
    if (!v)
        throw new Error(`Missing ${label} for key=${String(key)}`);
    return v;
}
function computeWorldMatrix(ctx, ins) {
    const byPath = new Map(ctx.instances.map(i => [i.path, i]));
    let cur = ins;
    let M = (0, transform_1.mat4Identity)();
    // On accumule de root -> enfant
    const chain = [];
    while (cur) {
        chain.push(cur);
        cur = cur.parentPath ? byPath.get(cur.parentPath) : undefined;
    }
    chain.reverse();
    for (const node of chain) {
        const Ml = (0, transform_1.mat4FromTR_XYZ)(node.instanceOrigin, node.instanceRotation);
        M = (0, transform_1.mat4Mul)(M, Ml); // ✅ world = parent * local
    }
    return M;
}
function computeWorldEuler(ctx, ins) {
    const byPath = new Map(ctx.instances.map(i => [i.path, i]));
    let cur = ins;
    const chain = [];
    while (cur) {
        chain.push(cur);
        cur = cur.parentPath ? byPath.get(cur.parentPath) : undefined;
    }
    chain.reverse();
    let r = { x: 0, y: 0, z: 0 };
    for (const node of chain) {
        r = (0, transform_1.addEuler)(r, node.instanceRotation);
    }
    return r;
}
