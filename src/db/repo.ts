import type { Db } from '../repository/sqlite.js';

export type ObjectDefinition = {
  id: number;
  name: string;
  comment: string;
  dimension: 2 | 3;
  param_letters: string;
  help_json?: string | null;
};

export type Template = {
  id: number;
  code: string;
  label: string;
  anchor_item_num: number | null;
  normalize_anchor_rot: number;
};

export type TemplateItemRow = {
  id: number;
  template_id: number;
  item_num: number;
  kind: 'OBJECT' | 'TEMPLATE_REF';
  object_def_id: number | null;
  ref_template_id: number | null;
  slot_name: string | null;
  repeat_expr: string | null;
  drawing_num: number;
  parent_item_num: number | null;
  parent_item_num2: number | null;
  pos_x_expr: string;
  pos_y_expr: string;
  pos_z_expr: string;
  rot_x_expr: string;
  rot_y_expr: string;
  rot_z_expr: string;
  params_json: string;
  visibility_json: string;
  misc_json: string;
  enabled_expr: string;
};

export type PlacementRuleRow = {
  id: number;
  owner_template_id: number;
  target_slot_name: string;
  rule_type: 'LINEAR' | 'STACK' | 'GRID' | 'RADIAL' | 'CUSTOM';
  axis: string | null;
  direction: number;
  spacing_expr: string | null;
  start_offset_expr: string | null;
  start_rot_expr: string | null;
  apply_rotation: number;
  condition_expr: string | null;
  order_index: number;
};

export type DeviceRow = {
  id: number;
  code_morpho: string;
  label: string;
  root_template_id: number;
  centrale_num: number;
  rft_path: string;
  application_json: string;
  bim_attrs_json: string;
  bim_dyn_json: string;
  globals_json: string;
};

export function getDeviceByMorpho(db: Db, code: string): DeviceRow {
  const row = db.prepare('SELECT * FROM device WHERE code_morpho = ?').get(code) as DeviceRow | undefined;
  if (!row) throw new Error(`Device not found for code_morpho='${code}'`);
  return row;
}

export function getTemplate(db: Db, id: number): Template {
  const row = db.prepare('SELECT * FROM template WHERE id = ?').get(id) as Template | undefined;
  if (!row) throw new Error(`Template id=${id} not found`);
  return row;
}

export function getTemplateItems(db: Db, templateId: number): TemplateItemRow[] {
  return db.prepare('SELECT * FROM template_item WHERE template_id = ? ORDER BY item_num').all(templateId) as TemplateItemRow[];
}

export function getObjectDefinition(db: Db, id: number): ObjectDefinition {
  const row = db.prepare('SELECT * FROM object_definition WHERE id = ?').get(id) as ObjectDefinition | undefined;
  if (!row) throw new Error(`ObjectDefinition id=${id} not found`);
  return row;
}

export function getPlacementRules(db: Db, ownerTemplateId: number): PlacementRuleRow[] {
  return db.prepare('SELECT * FROM placement_rule WHERE owner_template_id = ? ORDER BY order_index, id').all(ownerTemplateId) as PlacementRuleRow[];
}

export function getGlobals(db: Db): Record<string, unknown> {
  const rows = db.prepare('SELECT key, json FROM global_kv').all() as { key: string; json: string }[];
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.json);
    } catch {
      out[r.key] = r.json;
    }
  }
  return out;
}
