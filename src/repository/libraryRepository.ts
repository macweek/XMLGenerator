import { getDb } from "./sqlite";
import { selectMapped } from "../db/dbAdapter";

import {
  DeviceDefinition,
  Globals,
  ObjectDefinition,
  PlacementRule,
  Template,
  TemplateItem,
} from "../types/core";

function safeJsonParse<T>(s: any, fallback: T): T {
  if (s === null || s === undefined) return fallback;
  if (typeof s !== "string") return fallback;
  const trimmed = s.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } 
  catch {
    return fallback;
  }
}


export async function loadLibraryForDevice(_device: DeviceDefinition): Promise<{
  templates: Map<number, Template>;
  templateItemsByTemplate: Map<number, TemplateItem[]>;
  objectDefs: Map<number, ObjectDefinition>;
  placementRulesByOwner: Map<number, PlacementRule[]>;
  globals: Globals;
}> {
  const db = getDb();

  // -----------------------------
  // templates
  // -----------------------------
  const tRows = db
    .prepare(
      `SELECT id, code, label, version, anchor_item_num as anchorItemNum
       FROM template`
    )
    .all() as any[];

  const templates = new Map<number, Template>(
    tRows.map((r) => [
      r.id,
      {
        id: r.id,
        code: r.code,
        label: r.label,
        version: r.version,
        anchorItemNum: r.anchorItemNum ?? null,
      },
    ])
  );

  // -----------------------------
  // object_definition
  // -----------------------------
  const oRows = db
    .prepare(
      `SELECT id, name, comment, dimension, param_letters as paramLetters
       FROM object_definition`
    )
    .all() as any[];

  const objectDefs = new Map<number, ObjectDefinition>(
    oRows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        comment: r.comment,
        dimension: r.dimension,
        paramLetters: String(r.paramLetters || "")
          .split(";")
          .map((s: string) => s.trim())
          .filter(Boolean),
      },
    ])
  );

  // -----------------------------
  // template_item (JSON-driven via selectMapped)
  // -----------------------------
const iRows = selectMapped(
  "template_item",
  [
    "id",
    "templateId",
    "itemNum",
    "kind",
    "objectDefId",
    "refTemplateId",
    "slotName",
    "repeatCountExpr",
    "drawingNum",
    "parentItemNum",
    "parentItemNum2",
    "transformMode",
    "posXExpr",
    "posYExpr",
    "posZExpr",
    "rotXExpr",
    "rotYExpr",
    "rotZExpr",
    "paramsJson",
    "enabledExpr",
    "visibilityJson",
    "miscJson",
  ],
  undefined,
  [],
  {
    orderByLogical: ["templateId", "itemNum"],
  }
);


  const templateItemsByTemplate = new Map<number, TemplateItem[]>();

  for (const r of iRows) {
    const item: TemplateItem = {
      id: Number(r.id),
      templateId: Number(r.templateId),
      itemNum: Number(r.itemNum),

      kind: r.kind,

      objectDefId: r.objectDefId ?? null,
      refTemplateId: r.refTemplateId ?? null,
      slotName: r.slotName ?? null,
      repeatCountExpr: r.repeatCountExpr ?? null,
      repeatIndex: null, // pas dans ton schéma (et géré par l’engine)

      drawingNum: r.drawingNum ?? 1,
      parentItemNum: r.parentItemNum ?? null,
      // vient du JSON schema defaults si colonne absente
      transformMode: r.transformMode || "REL_ANCHOR",

      posXExpr: r.posXExpr ?? "0",
      posYExpr: r.posYExpr ?? "0",
      posZExpr: r.posZExpr ?? "0",
      rotXExpr: r.rotXExpr ?? "0",
      rotYExpr: r.rotYExpr ?? "0",
      rotZExpr: r.rotZExpr ?? "0",

      paramsJson: safeJsonParse<Record<string, any>>(r.paramsJson, {}),
      enabledExpr: r.enabledExpr ?? null,
      visibilityJson: safeJsonParse<Record<string, any> | null>(r.visibilityJson, null),
      miscJson: safeJsonParse<Record<string, any> | null>(r.miscJson, null),
    };

    const arr = templateItemsByTemplate.get(item.templateId) ?? [];
    arr.push(item);
    templateItemsByTemplate.set(item.templateId, arr);
  }

  // -----------------------------
  // placement_rule ✅ Point B
  // -----------------------------
  const pRows = db
    .prepare(
      `SELECT
        id,
        owner_template_id  as ownerTemplateId,
        target_slot_name   as targetSlotName,
        rule_type          as ruleType,
        axis,
        direction,
        spacing_expr       as spacingExpr,
        start_offset_expr  as startOffsetExpr,
        start_rot_expr     as startRotExpr,
        apply_rotation     as applyRotation,
        condition_expr     as conditionExpr,
        order_index        as orderIndex
      FROM placement_rule
      ORDER BY owner_template_id, order_index`
    )
    .all() as any[];

  const placementRulesByOwner = new Map<number, PlacementRule[]>();

  for (const r of pRows) {
    const rule: PlacementRule = {
      id: r.id,
      ownerTemplateId: r.ownerTemplateId,
      targetSlotName: r.targetSlotName,
      ruleType: r.ruleType,

      axis: r.axis ?? null,
      direction: (r.direction ?? 1) === -1 ? -1 : 1,

      spacingExpr: r.spacingExpr ?? null,
      startOffsetExpr: r.startOffsetExpr ?? null,
      startRotExpr: r.startRotExpr ?? null,

      referenceItemNum: 1,
      applyRotation: !!r.applyRotation,
      conditionExpr: r.conditionExpr ?? null,
      orderIndex: r.orderIndex ?? 0,
    };

    const arr = placementRulesByOwner.get(rule.ownerTemplateId) ?? [];
    arr.push(rule);
    placementRulesByOwner.set(rule.ownerTemplateId, arr);
  }

  // -----------------------------
  // globals (key/value)
  // -----------------------------
  const gRows = db
    .prepare(`SELECT key, json as jsonText FROM global_kv`)
    .all() as any[];

  const globals: Globals = {};
  for (const r of gRows) {
    globals[r.key] = r.jsonText ? safeJsonParse<any>(r.jsonText, r.jsonText) : null;
  }

  return {
    templates,
    templateItemsByTemplate,
    objectDefs,
    placementRulesByOwner,
    globals,
  };
}
