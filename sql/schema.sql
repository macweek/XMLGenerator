PRAGMA foreign_keys = ON;

-- ============================================================
-- 1) GraphGen object catalog (from DCCS021C.doc)
-- ============================================================
CREATE TABLE IF NOT EXISTS object_definition (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,              -- e.g. VOLUME, FONCTION, QUOTATION
  comment         TEXT NOT NULL,              -- e.g. PLAQUE, CYLINDRE, CONE
  dimension       INTEGER NOT NULL CHECK (dimension IN (2,3)),
  param_letters   TEXT NOT NULL,              -- e.g. "A;B;C" (order matters)
  help_json       TEXT                         -- optional metadata for UI
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_object_definition ON object_definition(name, comment, dimension);

-- ============================================================
-- 2) Templates and composition (complex objects)
-- ============================================================
CREATE TABLE IF NOT EXISTS template (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  code                 TEXT NOT NULL UNIQUE,  -- stable code, e.g. "FLECHE", "MODULE_OPERA_HI_S_1L"
  label                TEXT NOT NULL,
  version              INTEGER NOT NULL DEFAULT 1,
  anchor_item_num      INTEGER,               -- if NULL => first OBJECT item_num
  normalize_anchor_rot INTEGER NOT NULL DEFAULT 0, -- 0/1 : if 1, subtract anchor rotation too
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Each row defines either a simple object (OBJECT) or a reference to another template (TEMPLATE_REF)
CREATE TABLE IF NOT EXISTS template_item (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id        INTEGER NOT NULL REFERENCES template(id) ON DELETE CASCADE,
  item_num           INTEGER NOT NULL,                 -- order within template
  kind               TEXT NOT NULL CHECK (kind IN ('OBJECT','TEMPLATE_REF')),

  -- for OBJECT
  object_def_id      INTEGER REFERENCES object_definition(id),

  -- for TEMPLATE_REF
  ref_template_id    INTEGER REFERENCES template(id),
  slot_name          TEXT,                             -- stable alias for paths, e.g. 'modules', 'fleche'
  repeat_expr        TEXT,                             -- e.g. '5' or 'globals.nbModules' (optional)

  drawing_num        INTEGER NOT NULL DEFAULT 1,        -- target drawing in XML
  parent_item_num    INTEGER,                          -- becomes PARENT_NUM for OBJECT (optional)
  parent_item_num2   INTEGER,                          -- becomes PARENT_NUM2 (optional)

  -- Expression strings: can be numeric, '=...' or 'ref("path").px ...'
  pos_x_expr         TEXT NOT NULL DEFAULT '0',
  pos_y_expr         TEXT NOT NULL DEFAULT '0',
  pos_z_expr         TEXT NOT NULL DEFAULT '0',
  rot_x_expr         TEXT NOT NULL DEFAULT '0',
  rot_y_expr         TEXT NOT NULL DEFAULT '0',
  rot_z_expr         TEXT NOT NULL DEFAULT '0',

  params_json        TEXT NOT NULL DEFAULT '{}',        -- {"A":"950","B":"1170","C":"510",...}
  visibility_json    TEXT NOT NULL DEFAULT '{}',        -- overrides; empty => defaults by dimension
  misc_json          TEXT NOT NULL DEFAULT '{}',        -- layer/colors/materials...
  enabled_expr       TEXT NOT NULL DEFAULT '1',         -- allow options-driven inclusion (0/1 expression)

  UNIQUE(template_id, item_num),
  CHECK (
    (kind='OBJECT' AND object_def_id IS NOT NULL AND ref_template_id IS NULL)
    OR
    (kind='TEMPLATE_REF' AND ref_template_id IS NOT NULL)
  )
);

-- ============================================================
-- 3) Devices (APPAREIL) and options
-- ============================================================
CREATE TABLE IF NOT EXISTS device (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code_morpho       TEXT NOT NULL UNIQUE,
  label             TEXT NOT NULL,
  root_template_id  INTEGER NOT NULL REFERENCES template(id),
  centrale_num      INTEGER NOT NULL DEFAULT 1,
  rft_path          TEXT NOT NULL DEFAULT '',
  application_json  TEXT NOT NULL DEFAULT '{}',   -- APP_NAME, MODE, NIV_EXE, etc (optional)
  bim_attrs_json    TEXT NOT NULL DEFAULT '{}',   -- ATTRIBUTS_BIM (optional)
  bim_dyn_json      TEXT NOT NULL DEFAULT '[]',   -- ATTRIBUTS_BIM_DYNAMIQUE (optional array)
  globals_json      TEXT NOT NULL DEFAULT '{}'    -- default globals for this device
);

-- Option definitions (for UI). At runtime, options are merged into scope.options.*
CREATE TABLE IF NOT EXISTS option_definition (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,   -- e.g. 'armoire_elec', 'vase_expansion'
  label         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('bool','number','string')),
  default_json  TEXT NOT NULL DEFAULT 'null'      -- JSON value
);

-- Device supports which options
CREATE TABLE IF NOT EXISTS device_option (
  device_id     INTEGER NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  option_id     INTEGER NOT NULL REFERENCES option_definition(id) ON DELETE CASCADE,
  required      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, option_id)
);

-- ============================================================
-- 4) Placement rules for repetitive instances (Option A)
-- ============================================================
CREATE TABLE IF NOT EXISTS placement_rule (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_template_id  INTEGER NOT NULL REFERENCES template(id) ON DELETE CASCADE,
  target_slot_name   TEXT NOT NULL,          -- slot to arrange, e.g. 'modules'
  rule_type          TEXT NOT NULL CHECK (rule_type IN ('LINEAR','STACK','GRID','RADIAL','CUSTOM')),
  axis               TEXT,                   -- 'X'|'Y'|'Z' when applicable
  direction          INTEGER NOT NULL DEFAULT 1, -- 1 or -1
  spacing_expr       TEXT,                   -- expression; can use prev, i, globals, options, ref(...)
  start_offset_expr  TEXT DEFAULT '0',
  start_rot_expr     TEXT DEFAULT '0;0;0',   -- 'rx;ry;rz' degrees
  apply_rotation     INTEGER NOT NULL DEFAULT 0,
  condition_expr     TEXT,                   -- optional: expression => 0/1
  order_index        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_template_item_template ON template_item(template_id);
CREATE INDEX IF NOT EXISTS ix_placement_rule_owner ON placement_rule(owner_template_id, target_slot_name);

-- ============================================================
-- 5) Global named values (shared tables like tableGMV.*)
-- ============================================================
CREATE TABLE IF NOT EXISTS global_kv (
  key   TEXT PRIMARY KEY,
  json  TEXT NOT NULL           -- JSON value (number/string/object)
);
