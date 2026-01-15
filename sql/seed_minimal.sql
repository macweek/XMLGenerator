PRAGMA foreign_keys = ON;

-- Basic object types (minimal set)
INSERT OR IGNORE INTO object_definition(name, comment, dimension, param_letters) VALUES
 ('VOLUME','PROFILE_TRAPEZE',3,'A;B;C;D;E'),
 ('VOLUME','PLAQUE',3,'A;B;C'),
 ('VOLUME','CYLINDRE',3,'A;B'),
 ('VOLUME','CONE',3,'A;B'),
 ('FONCTION','CERCLE',3,'A;B;C;D;E'),
 ('QUOTATION','COTE',3,'A;B;C;D;E;F;G;H;I'),
 ('SYMBOLE_DIVERS','TEXTE',2,'A;B;C;D');

-- Template: FLECHE (cylindre + cone)
INSERT OR IGNORE INTO template(code,label,anchor_item_num) VALUES ('FLECHE','Fleche standard',1);

-- Items for FLECHE
INSERT OR IGNORE INTO template_item(template_id,item_num,kind,object_def_id,drawing_num,
  pos_x_expr,pos_y_expr,pos_z_expr,rot_x_expr,rot_y_expr,rot_z_expr,params_json,misc_json)
SELECT t.id,1,'OBJECT',od.id,1,
 '0','0','0','0','0','0',
 json_object('A','30','B','100'),
 json_object('LAYER','DRY_SYMBOL','R',150,'G',150,'B',150)
FROM template t JOIN object_definition od
 ON od.name='VOLUME' AND od.comment='CYLINDRE' AND od.dimension=3
WHERE t.code='FLECHE';

INSERT OR IGNORE INTO template_item(template_id,item_num,kind,object_def_id,drawing_num,
  pos_x_expr,pos_y_expr,pos_z_expr,rot_x_expr,rot_y_expr,rot_z_expr,params_json,misc_json)
SELECT t.id,2,'OBJECT',od.id,1,
 '0','0','local(1).B', '0','0','0',
 json_object('A','75','B','50'),
 json_object('LAYER','DRY_SYMBOL','R',150,'G',150,'B',150)
FROM template t JOIN object_definition od
 ON od.name='VOLUME' AND od.comment='CONE' AND od.dimension=3
WHERE t.code='FLECHE';

-- Template: MODULE_SIMPLE (profile + gmv + fleche)
INSERT OR IGNORE INTO template(code,label,anchor_item_num) VALUES ('MODULE_SIMPLE','Module simple demo',1);

-- 1) corps
INSERT OR IGNORE INTO template_item(template_id,item_num,kind,object_def_id,drawing_num,
  pos_x_expr,pos_y_expr,pos_z_expr,rot_x_expr,rot_y_expr,rot_z_expr,params_json,misc_json)
SELECT t.id,1,'OBJECT',od.id,1,
 '0','0','63.5','0','0','180',
 json_object('A','1600','B','1170','C','510','D','0','E','0'),
 json_object('LAYER','DRY_CORPS','R',200,'G',200,'B',200,'BIM_MATERIAUX','C_GALVA')
FROM template t JOIN object_definition od
 ON od.name='VOLUME' AND od.comment='PROFILE_TRAPEZE' AND od.dimension=3
WHERE t.code='MODULE_SIMPLE';

-- 2) gmv
INSERT OR IGNORE INTO template_item(template_id,item_num,kind,object_def_id,drawing_num,
  pos_x_expr,pos_y_expr,pos_z_expr,rot_x_expr,rot_y_expr,rot_z_expr,params_json,misc_json)
SELECT t.id,2,'OBJECT',od.id,1,
 '0','0','63.5 + local(1).C/2','90','0','180',
 json_object('A','1065','B','423'),
 json_object('LAYER','DRY_CORPS','R',150,'G',150,'B',150,'BIM_MATERIAUX','C_9005')
FROM template t JOIN object_definition od
 ON od.name='VOLUME' AND od.comment='CYLINDRE' AND od.dimension=3
WHERE t.code='MODULE_SIMPLE';

-- 3) fleche as sub-template
INSERT OR IGNORE INTO template_item(template_id,item_num,kind,ref_template_id,slot_name,repeat_expr,
  drawing_num,pos_x_expr,pos_y_expr,pos_z_expr,rot_x_expr,rot_y_expr,rot_z_expr,enabled_expr)
SELECT parent.id,3,'TEMPLATE_REF',child.id,'fleche',NULL,
 1,'0','0','63.5 + local(1).C/2 + local(2).B','0','0','0','1'
FROM template parent JOIN template child
WHERE parent.code='MODULE_SIMPLE' AND child.code='FLECHE';

-- Device: OPERA_DEMO_3MODULES
INSERT OR IGNORE INTO template(code,label,anchor_item_num) VALUES ('APPAREIL_DEMO','Appareil demo',1);

-- Root template instantiates MODULE_SIMPLE 3 times
INSERT OR IGNORE INTO template_item(template_id,item_num,kind,ref_template_id,slot_name,repeat_expr,
  drawing_num,pos_x_expr,pos_y_expr,pos_z_expr,rot_x_expr,rot_y_expr,rot_z_expr,enabled_expr)
SELECT root.id,1,'TEMPLATE_REF',mod.id,'modules','3',
 1,'0','0','0','0','0','0','1'
FROM template root JOIN template mod
WHERE root.code='APPAREIL_DEMO' AND mod.code='MODULE_SIMPLE';

-- Placement rule: linear along X using previous module length (local anchor item 1 param A)
INSERT OR IGNORE INTO placement_rule(owner_template_id,target_slot_name,rule_type,axis,direction,spacing_expr,start_offset_expr)
SELECT t.id,'modules','LINEAR','X',1,'ref(prev/1).A','0'
FROM template t WHERE t.code='APPAREIL_DEMO';

-- Options
INSERT OR IGNORE INTO option_definition(code,label,type,default_json) VALUES
 ('armoire_elec','Armoire electrique','bool','false'),
 ('vase_expansion','Vase d''expansion','bool','false');

-- Device record
INSERT OR IGNORE INTO device(code_morpho,label,root_template_id,centrale_num,rft_path,application_json,bim_attrs_json,globals_json)
SELECT 'OPERA_DEMO','Opera demo 3 modules',t.id,1,'CARRIER_FAMILY_TEMPLATE',
  json_object('APP_NAME','TS_GENERATOR','MODE','M0','NIV_EXE','10'),
  json_object('MODELE','OPERA','FABRICANT','CIAT','DESCRIPTION','Drycooler'),
  json_object('tableGMV', json_object('diam',1065,'haut',423))
FROM template t WHERE t.code='APPAREIL_DEMO';

-- Link options to device
INSERT OR IGNORE INTO device_option(device_id, option_id)
SELECT d.id, o.id FROM device d, option_definition o
WHERE d.code_morpho='OPERA_DEMO' AND o.code IN ('armoire_elec','vase_expansion');
