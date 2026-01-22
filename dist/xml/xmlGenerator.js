"use strict";
/**
 * XML Generator (GraphGen / CIATLST)
 *
 * Entrée:
 * - ctx.objects : liste d'objets résolus (origin/rotation/params déjà finalisés)
 *
 * Sortie:
 * - string XML au format proche de SARAH1.xml (CIATLST -> CENTRALE -> DRAWING -> OBJECT)
 *
 * Note MVP:
 * - APPLICATION/CALL/PROP: squelette minimal (tu pourras enrichir ensuite)
 * - VISIBILITY/MISC: si absent, on met des défauts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateXml = generateXml;
const xmlbuilder2_1 = require("xmlbuilder2");
//export function generateXml(ctx: DeviceContext): string
function generateXml(ctx, meta) {
    const ci = meta?.ciatlst ?? {};
    const doc = (0, xmlbuilder2_1.create)()
        .ele("CIATLST", {
        COMPUTER_NAME: String(ci.computerName ?? ""),
        USER_NAME: String(ci.userName ?? " "),
        DATE_TIME: String(ci.dateTime ?? ""),
    });
    // --- Squelette minimal (comme SARAH1.xml) ---
    const app = meta?.application ?? {};
    const appEle = doc.ele("APPLICATION", {
        APP_NAME: String(app.appName ?? ""),
        MODE: String(app.mode ?? ""),
        NIV_EXE: String(app.nivExe ?? ""),
    });
    // contenu interne "SARAH + balises"
    if (app.body && typeof app.body === "object") {
        appEle.txt("SARAH");
        for (const [k, v] of Object.entries(app.body)) {
            appEle.ele(String(k)).txt(String(v ?? "")).up();
        }
    }
    appEle.up();
    doc.ele("CALL").up();
    const p = meta?.prop ?? {};
    const propEle = doc.ele("PROP");
    function writeFields(parent, obj) {
        if (!obj || typeof obj !== "object")
            return;
        for (const [k, v] of Object.entries(obj)) {
            parent.ele(String(k)).txt(String(v ?? "")).up();
        }
    }
    const fromEle = propEle.ele("FROM");
    writeFields(fromEle, p.from);
    fromEle.up();
    const toEle = propEle.ele("TO");
    writeFields(toEle, p.to);
    toEle.up();
    const infosEle = propEle.ele("INFOS");
    writeFields(infosEle, p.infos);
    infosEle.up();
    propEle.up();
    // --- CENTRALE ---
    const centraleMeta = meta?.centrale ?? {};
    const centrale = doc.ele("CENTRALE", {
        NUM: String(centraleMeta.num ?? ctx.device.id ?? 1),
        RFT_PATH: String(centraleMeta.rftPath ?? ""),
    });
    //ATTRIBUTS BIM
    const bim = centrale.ele("ATTRIBUTS_BIM");
    const attrs = centraleMeta.attributsBim ?? {};
    for (const [k, v] of Object.entries(attrs)) {
        bim.ele(k).txt(String(v)).up();
    }
    bim.up();
    //ATTRIBUTS  BIM DYNAMI
    const dyn = centrale.ele("ATTRIBUTS_BIM_DYNAMIQUE");
    const list = Array.isArray(centraleMeta.attributsBimDyn) ? centraleMeta.attributsBimDyn : [];
    for (const a of list) {
        const attr = dyn.ele("ATTRIBUT", { NAME: String(a.NAME ?? "") });
        attr.ele("TYPE").txt(String(a.TYPE ?? "")).up();
        attr.ele("VALEUR").txt(String(a.VALEUR ?? "")).up();
        attr.ele("UNITE").txt(String(a.UNITE ?? "")).up();
        attr.ele("GROUPE").txt(String(a.GROUPE ?? "")).up();
        attr.up();
    }
    dyn.up();
    // Grouper par drawingNum
    const byDrawing = groupByDrawing(ctx.objects);
    for (const drawingNum of [...byDrawing.keys()].sort((a, b) => a - b)) {
        const drawing = centrale.ele("DRAWING", { NUM: String(drawingNum) });
        // Remap NUM pour être sûr d'avoir une séquence propre par drawing
        const objs = byDrawing.get(drawingNum).slice().sort((a, b) => a.num - b.num);
        const remap = new Map();
        for (let i = 0; i < objs.length; i++) {
            remap.set(objs[i].objectPath, i + 1);
        }
        // Optionnel: parentNum basé sur parentItemNum (si on veut le faire maintenant)
        // MVP: on garde parentNum actuel si déjà set, sinon -1
        for (const o of objs) {
            const parentNum = o.parentNum;
            const obj = drawing.ele("OBJECT", {
                NUM: String(remap.get(o.objectPath) ?? o.num),
                DIMENSION: String(o.dimension),
                NAME: o.name,
                COMMENT: o.comment,
                PARENT_NUM: String(parentNum ?? -1),
            });
            // ORIGIN
            const origin = obj.ele("ORIGIN");
            origin.ele("X").txt(num(o.origin.x)).up();
            origin.ele("Y").txt(num(o.origin.y)).up();
            origin.ele("Z").txt(num(o.origin.z)).up();
            origin.up();
            // ROTATION
            const rot = obj.ele("ROTATION");
            rot.ele("X").txt(num(o.rotation.x)).up();
            rot.ele("Y").txt(num(o.rotation.y)).up();
            rot.ele("Z").txt(num(o.rotation.z)).up();
            rot.up();
            // PARAMETERS (A..)
            const params = obj.ele("PARAMETERS");
            for (const [k, v] of Object.entries(o.params)) {
                params.ele(k).txt(String(v)).up();
            }
            params.up();
            // VISIBILITY
            const vis = obj.ele("VISIBILITY");
            const visibility = ensureVisibility(o);
            for (const [k, v] of Object.entries(visibility)) {
                vis.ele(k).txt(String(v)).up();
            }
            vis.up();
            // MISCELLANEAOUS (GraphGen orthographe)
            const misc = obj.ele("MISCELLANEAOUS");
            const miscVals = ensureMisc(o);
            for (const [k, v] of Object.entries(miscVals)) {
                misc.ele(k).txt(String(v)).up();
            }
            misc.up();
            obj.up();
        }
        drawing.up();
    }
    centrale.up();
    return doc.end({
        prettyPrint: true,
        headless: true
    });
}
// -----------------------------
// Helpers
// -----------------------------
function groupByDrawing(objects) {
    const map = new Map();
    for (const o of objects) {
        const arr = map.get(o.drawingNum) ?? [];
        arr.push(o);
        map.set(o.drawingNum, arr);
    }
    return map;
}
function ensureVisibility(o) {
    // Si déjà présent, on complète.
    const base = o.dimension === 3
        ? {
            OBJECT_SPACE: 1,
            FRONT: 1,
            REAR: 1,
            LEFT: 1,
            RIGHT: 1,
            TOP: 1,
            BOTTOM: 1,
            THREE_DIM: 1,
            TOP_DETAILS: 1,
            BIM_VISIBILITY: 1,
        }
        : {
            OBJECT_SPACE: 0,
            FRONT: 1,
            REAR: 1,
            LEFT: 1,
            RIGHT: 1,
            TOP: 1,
            BOTTOM: 1,
            THREE_DIM: 0,
            TOP_DETAILS: 1,
            BIM_VISIBILITY: 1,
        };
    return { ...base, ...(o.visibility ?? {}) };
}
function ensureMisc(o) {
    const base = {
        LAYER: "0",
        R: 200,
        G: 200,
        B: 200,
        BIM_MATERIAUX: "",
        BIM_OPAQUE: "",
    };
    return { ...base, ...(o.misc ?? {}) };
}
function num(n) {
    // format simple: éviter les "1e-7"
    if (!Number.isFinite(n))
        return "0";
    const s = n.toString();
    if (s.includes("e") || s.includes("E"))
        return n.toFixed(6);
    return s;
}
function formatDateTime(d) {
    // format proche "2023/04/19 17:34:39"
    const pad = (x) => String(x).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}
