/**
 * Types centraux du moteur (DB -> Runtime -> XML)
 *
 * Objectifs:
 * - Typage clair et stable
 * - Ne dépend pas de SQLite ni de l'XML
 * - Sert de “contrat” entre repository/runtime/xml
 */

export type Dimension = 2 | 3;

export type Vec3 = { x: number; y: number; z: number };

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

// -----------------------------
// DEFINITIONS (catalogue GraphGen)
// -----------------------------
export type ObjectDefinition = {
  id: number;
  name: string; // ex: "VOLUME", "FONCTION", "SYMBOLE_DIVERS"
  comment: string; // ex: "PLAQUE", "CYLINDRE", "CONE", ...
  dimension: Dimension;
  paramLetters: string[]; // ex: ["A","B","C"]
};

// -----------------------------
// TEMPLATES (définition)
// -----------------------------
export type Template = {
  id: number;
  code: string; // ex: "FLECHE", "MODULE_OPERA_HI_S_1L"
  label: string;
  version: number;
  // Si null: anchor = premier item simple OBJECT par itemNum croissant
  anchorItemNum?: number | null;
};

export type TemplateItemKind = "OBJECT" | "TEMPLATE_REF";

/**
 * Comment interpréter pos/rot ?
 * - ABS: valeurs exprimées dans le repère du parent (rare, plutôt pour “root”)
 * - REL_ANCHOR: valeurs exprimées dans le repère du template (recommandé)
 * - REL_ITEM: valeurs exprimées dans le repère d'un autre item (parentItemNum)
 */
export type TransformMode = "ABS" | "REL_ANCHOR" | "REL_ITEM";

export type TemplateItem = {
  id: number;
  templateId: number;
  itemNum: number;

  kind: TemplateItemKind;

  // Si OBJECT
  objectDefId?: number | null;

  // Si TEMPLATE_REF
  refTemplateId?: number | null;
  slotName?: string | null; // ex: "modules", "fleche", "gmv"
  repeatCountExpr?: string | null; // ex: "5", "options.nbModules", "globals.nb"
  repeatIndex?: number | null; // si tu stockes explicitement (facultatif)

  drawingNum: number;

  // Relation / composition
  parentItemNum?: number | null; // utilisé si TransformMode=REL_ITEM (ou parent_num XML)
  transformMode: TransformMode;

  // Expressions (toujours en string; résolues au runtime)
  posXExpr: string;
  posYExpr: string;
  posZExpr: string;
  rotXExpr: string;
  rotYExpr: string;
  rotZExpr: string;

  // Paramètres A..Z (expressions)
  paramsJson: Record<string, string>; // {"A":"950","B":"1170","C":"510"} etc.

  // Filtrage par options (optionnel)
  enabledExpr?: string | null; // ex: "options.armoire == true"

  // Visibilité / Misc (optionnel)
  visibilityJson?: Record<string, JsonValue> | null;
  miscJson?: Record<string, JsonValue> | null;
};

// -----------------------------
// APPAREIL
// -----------------------------
export type DeviceDefinition = {
  id: number;
  morphoCode: string; // unique
  label: string;
  rootTemplateId: number;

  // overrides optionnels (ex: surcharger des globals, params, etc.)
  overridesJson?: Record<string, JsonValue> | null;
};

// -----------------------------
// OPTIONS / GLOBALS
// -----------------------------
export type DeviceOptions = Record<string, string | number | boolean>;

export type Globals = Record<string, string | number | boolean>;

// -----------------------------
// PLACEMENT RULES (répétitions)
// -----------------------------
export type PlacementRuleType = "LINEAR" | "STACK" | "GRID" | "RADIAL" | "CUSTOM";

/**
 * Une règle se rattache à un owner_template (souvent l'appareil ou template parent)
 * et vise un slotName (ex: "modules") qui correspond aux TEMPLATE_REF (répétitions).
 */
export type PlacementRule = {
  id: number;
  ownerTemplateId: number;
  targetSlotName: string;
  startRotExpr?: string | null;
  
  ruleType: PlacementRuleType;

  axis?: "X" | "Y" | "Z" | null;
  direction: 1 | -1;

  spacingExpr?: string | null; // ex: "ref(prev/1).A + 20"
  startOffsetExpr?: string | null; // ex: "0" ou "100"

  referenceItemNum: number; // généralement 1 (ancre)
  applyRotation: boolean;

  conditionExpr?: string | null; // ex: "i > 0"
  orderIndex: number;
};

// -----------------------------
// RUNTIME (instances + registry path)
// -----------------------------
/**
 * InstancePath = adresse stable dans l'arbre
 * ex: "root/modules[3]" (instance de template), puis un objet: "root/modules[3]/1"
 */
export type InstancePath = string;
export type ObjectPath = string;

export type TemplateInstance = {
  instanceId: string; // UUID ou string unique (runtime)
  templateId: number;
  path: InstancePath; // ex: "root/modules[0]"
  parentPath?: InstancePath | null;

  // Transform de l'instance (appliqué après normalisation ancre)
  instanceOrigin: Vec3;
  instanceRotation: Vec3;
  repeatIndex?: number; // 0..N-1
};

/**
 * Résultat final prêt à exporter en XML: un OBJECT GraphGen.
 */
export type ResolvedObject = {
  objectPath: ObjectPath; // ex: "root/modules[0]/2"
  drawingNum: number;

  // Champs XML
  num: number; // NUM unique dans un drawing (le moteur décidera)
  dimension: Dimension;
  name: string; // def.name
  comment: string; // def.comment
  parentNum: number; // -1 si aucun

  origin: Vec3;
  rotation: Vec3;

  // A..Z selon def.paramLetters
  params: Record<string, string>;

  visibility: Record<string, JsonValue>;
  misc: Record<string, JsonValue>;

  // Pour debugging / refs
  templateItemId: number;
  templateId: number;
  itemNum: number;
};

// -----------------------------
// CONTEXTE GLOBAL DE GENERATION
// -----------------------------
export type DeviceContext = {
  device: DeviceDefinition;
  options: DeviceOptions;
  globals: Globals;

  // Library / definitions
  templates: Map<number, Template>;
  templateItemsByTemplate: Map<number, TemplateItem[]>;
  objectDefs: Map<number, ObjectDefinition>;
  placementRulesByOwner: Map<number, PlacementRule[]>;

  // Résultats runtime
  instances: TemplateInstance[];
  objects: ResolvedObject[];

  // Registry pour les refs: path -> objet
  objectRegistry: Map<ObjectPath, ResolvedObject>;
};
