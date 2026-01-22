"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDeviceDefinition = loadDeviceDefinition;
const sqlite_1 = require("./sqlite");
async function loadDeviceDefinition(morphoCode) {
    const db = (0, sqlite_1.getDb)();
    const row = db
        .prepare(`SELECT
        id,
        code_morpho as morphoCode,
        label,
        root_template_id as rootTemplateId,
        overrides_json as overridesJson
      FROM device
      WHERE code_morpho = ?`)
        .get(morphoCode);
    if (!row)
        throw new Error(`Device introuvable: ${morphoCode}`);
    return {
        id: row.id,
        morphoCode: row.morphoCode,
        label: row.label,
        rootTemplateId: row.rootTemplateId,
        overridesJson: row.overridesJson ? JSON.parse(row.overridesJson) : null,
    };
}
