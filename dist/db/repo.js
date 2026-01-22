"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeviceByMorpho = getDeviceByMorpho;
exports.getTemplate = getTemplate;
exports.getTemplateItems = getTemplateItems;
exports.getObjectDefinition = getObjectDefinition;
exports.getPlacementRules = getPlacementRules;
exports.getGlobals = getGlobals;
function getDeviceByMorpho(db, code) {
    const row = db.prepare('SELECT * FROM device WHERE code_morpho = ?').get(code);
    if (!row)
        throw new Error(`Device not found for code_morpho='${code}'`);
    return row;
}
function getTemplate(db, id) {
    const row = db.prepare('SELECT * FROM template WHERE id = ?').get(id);
    if (!row)
        throw new Error(`Template id=${id} not found`);
    return row;
}
function getTemplateItems(db, templateId) {
    return db.prepare('SELECT * FROM template_item WHERE template_id = ? ORDER BY item_num').all(templateId);
}
function getObjectDefinition(db, id) {
    const row = db.prepare('SELECT * FROM object_definition WHERE id = ?').get(id);
    if (!row)
        throw new Error(`ObjectDefinition id=${id} not found`);
    return row;
}
function getPlacementRules(db, ownerTemplateId) {
    return db.prepare('SELECT * FROM placement_rule WHERE owner_template_id = ? ORDER BY order_index, id').all(ownerTemplateId);
}
function getGlobals(db) {
    const rows = db.prepare('SELECT key, json FROM global_kv').all();
    const out = {};
    for (const r of rows) {
        try {
            out[r.key] = JSON.parse(r.json);
        }
        catch {
            out[r.key] = r.json;
        }
    }
    return out;
}
