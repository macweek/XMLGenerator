import { getDb } from "./sqlite";
import { DeviceDefinition } from "../types/core";

type DeviceRow = {
  id: number;
  morphoCode: string;
  label: string;
  rootTemplateId: number;
  overridesJson: string | null;
};

export async function loadDeviceDefinition(morphoCode: string): Promise<DeviceDefinition> {
  const db = getDb();

  const row = db
    .prepare(
      `SELECT
        id,
        code_morpho as morphoCode,
        label,
        root_template_id as rootTemplateId,
        overrides_json as overridesJson
      FROM device
      WHERE code_morpho = ?`
    )
    .get(morphoCode) as DeviceRow | undefined;

  if (!row) throw new Error(`Device introuvable: ${morphoCode}`);

  return {
    id: row.id,
    morphoCode: row.morphoCode,
    label: row.label,
    rootTemplateId: row.rootTemplateId,
    overridesJson: row.overridesJson ? JSON.parse(row.overridesJson) : null,
  };
}
