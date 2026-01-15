/**
 * Expression evaluator (MVP + évolutif)
 *
 * Ce fichier fournit:
 * - evalNumber(expr, env)
 * - evalString(expr, env)
 * - resolveTemplateObjects(ctx): transforme (instances + templateItems OBJECT) => ResolvedObject[]
 *
 * Supporte (MVP):
 * - nombres: "123", "=123", "10+5", "(1+2)*3"
 * - options.xxx, globals.xxx
 * - ref("path/to/object").px|py|pz|rx|ry|rz|A|B|C...
 * - local(n).px ... (référence à un itemNum dans la même instance)
 *
 * Important:
 * - Sécurité: pas de "eval" JS
 * - Parser simple (shunting-yard) pour + - * / () et variables / appels ref/local
 *
 * Limites MVP:
 * - pas de ternaires ?:
 * - pas de fonctions avancées (min/max) (facile à ajouter ensuite)
 */

import {
  DeviceContext,
  JsonValue,
  ObjectDefinition,
  ObjectPath,
  ResolvedObject,
  TemplateInstance,
  TemplateItem,
  Vec3,
} from "../types/core";

// -----------------------------
// Public API
// -----------------------------

export type EvalEnv = {
  ctx: DeviceContext;
  instance: TemplateInstance;

  // index de répétition (si besoin plus tard)
  i?: number;

  // "prev" possible plus tard (pour rules CUSTOM)
  prevInstancePath?: string | null;
};

export function evalNumber(expr: string, env: EvalEnv): number {
  const v = evalValue(expr, env);
  if (typeof v === "number") return v;

  // Si string convertible
  const n = Number(v);
  if (Number.isFinite(n)) return n;

  throw new Error(`Expression not a number: ${expr} -> ${String(v)}`);
}

export function evalString(expr: string, env: EvalEnv): string {
  const v = evalValue(expr, env);
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/**
 * Passe 1 (runtime objects):
 * - crée des ResolvedObject par instance, pour chaque TemplateItem OBJECT
 * - résout pos/rot/params via expressions
 * - remplit ctx.objects + ctx.objectRegistry
 *
 * Note: l'ancre (normalisation) sera appliquée au fichier 5.
 */
export function resolveTemplateObjects(ctx: DeviceContext): ResolvedObject[] {
  const objects: ResolvedObject[] = [];
  const registry = new Map<ObjectPath, ResolvedObject>();

  const countersByDrawing = new Map<number, number>();

  // -----------------------------
  // PASS 1: créer + enregistrer (sans eval des expressions)
  // -----------------------------
  for (const instance of ctx.instances) {
    const items = ctx.templateItemsByTemplate.get(instance.templateId) ?? [];

    for (const it of items) {
      if (it.kind !== "OBJECT") continue;
      if (!it.objectDefId) continue;

      // enabled_expr (on peut déjà l'évaluer, car pas dépendant de local/ref en général)
      // si jamais il dépend de local/ref, tu peux le déplacer en pass2.
      if (it.enabledExpr && !evalBoolean(it.enabledExpr, { ctx, instance })) {
        continue;
      }

      const def = mustGet(ctx.objectDefs, it.objectDefId, "ObjectDefinition");

      const drawingNum = it.drawingNum ?? 1;
      const nextNum = (countersByDrawing.get(drawingNum) ?? 0) + 1;
      countersByDrawing.set(drawingNum, nextNum);

      const objectPath = `${instance.path}/${it.itemNum}`;

      // objet "placeholder" (0 partout)
      const resolved: ResolvedObject = {
        objectPath,
        drawingNum,
        num: nextNum,
        dimension: def.dimension,
        name: def.name,
        comment: def.comment,
        parentNum: -1,

        origin: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },

        params: Object.fromEntries(def.paramLetters.map((l) => [l, "0"])),

        visibility: (it.visibilityJson ?? {}) as Record<string, JsonValue>,
        misc: (it.miscJson ?? {}) as Record<string, JsonValue>,

        templateItemId: it.id,
        templateId: it.templateId,
        itemNum: it.itemNum,
      };

      objects.push(resolved);
      registry.set(objectPath, resolved);
    }
  }

  // On publie le registry maintenant -> local()/ref() marcheront en pass2
  ctx.objects = objects;
  ctx.objectRegistry = registry;

  // -----------------------------
  // PASS 2: évaluer expressions (pos/rot/params)
  // -----------------------------
  for (const instance of ctx.instances) {
    const items = ctx.templateItemsByTemplate.get(instance.templateId) ?? [];
    for (const it of items) {
      if (it.kind !== "OBJECT") continue;
      if (!it.objectDefId) continue;

      const objectPath = `${instance.path}/${it.itemNum}`;
      const obj = ctx.objectRegistry.get(objectPath);
      if (!obj) continue; // non créé en pass1 (ex: disabled)

      const def = mustGet(ctx.objectDefs, it.objectDefId, "ObjectDefinition");
      const env: EvalEnv = { ctx, instance ,i: (instance as any).repeatIndex ?? 0 };

      obj.origin = {
        x: evalNumber(it.posXExpr, env),
        y: evalNumber(it.posYExpr, env),
        z: evalNumber(it.posZExpr, env),
      };

      obj.rotation = {
        x: evalNumber(it.rotXExpr, env),
        y: evalNumber(it.rotYExpr, env),
        z: evalNumber(it.rotZExpr, env),
      };

      const params: Record<string, string> = {};
      for (const letter of def.paramLetters) {
        const raw = it.paramsJson?.[letter];
        if (raw === undefined || raw === null) {
          params[letter] = "0";
        } else {
          try {
            params[letter] = String(evalValue(String(raw), env));
          } catch {
            params[letter] = String(raw).replace(/^=/, "");
          }
        }
      }
      obj.params = params;
    }
  }

  return ctx.objects;
}



// -----------------------------
// Boolean eval (simple)
// -----------------------------

function evalBoolean(expr: string, env: EvalEnv): boolean {
  // MVP: accepte "true/false", "1/0", ou expression numérique non-nulle
  const v = evalValue(expr, env);
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).toLowerCase().trim();
  if (s === "true") return true;
  if (s === "false") return false;
  const n = Number(s);
  if (Number.isFinite(n)) return n !== 0;
  return Boolean(s);
}

// -----------------------------
// Core evaluator
// -----------------------------

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "str"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "dot" }
  | { t: "comma" };

function evalValue(expr: string, env: EvalEnv): any {
  const cleaned = (expr ?? "").trim().replace(/^=/, "");
  if (cleaned === "") return 0;

  // Short-cuts
  if (cleaned === "true") return true;
  if (cleaned === "false") return false;

  // Si c'est un simple nombre
  const asNum = Number(cleaned);
  if (Number.isFinite(asNum) && /^[+-]?\d+(\.\d+)?$/.test(cleaned)) return asNum;
  // Si l'expression contient des "chains" (local/ref/options/globals), on passe par evalWithChains
  if (
    cleaned.includes("local(") ||
    cleaned.includes("ref(") ||
    cleaned.includes("options.") ||
    cleaned.includes("globals.")
  ) {
  return evalWithChains(cleaned, env);
}

  // Tokenize
  const tokens = tokenize(cleaned);

  // Shunting-yard -> RPN
  const rpn = toRpn(tokens);

  // Eval RPN avec "stack"
  return evalRpn(rpn, env);
}

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;

  const isAlpha = (c: string) => /[A-Za-z_]/.test(c);
  const isAlnum = (c: string) => /[A-Za-z0-9_]/.test(c);
  const isDigit = (c: string) => /[0-9]/.test(c);

  while (i < s.length) {
    const c = s[i];

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }

    if (c === "(") {
      out.push({ t: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ t: "rp" });
      i++;
      continue;
    }
    if (c === ".") {
      out.push({ t: "dot" });
      i++;
      continue;
    }
    if (c === ",") {
      out.push({ t: "comma" });
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }

    // String: ref("...") ou n'importe quelle string entre quotes
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      let buf = "";
      while (i < s.length && s[i] !== quote) {
        // support minimal d'escape \"
        if (s[i] === "\\" && i + 1 < s.length) {
          buf += s[i + 1];
          i += 2;
          continue;
        }
        buf += s[i];
        i++;
      }
      if (i >= s.length) throw new Error(`Unclosed string in expr: ${s}`);
      i++; // consume closing quote
      out.push({ t: "str", v: buf });
      continue;
    }

    // Number literal
    if (isDigit(c)) {
      let buf = c;
      i++;
      while (i < s.length && (isDigit(s[i]) || s[i] === ".")) {
        buf += s[i];
        i++;
      }
      const n = Number(buf);
      if (!Number.isFinite(n)) throw new Error(`Invalid number: ${buf}`);
      out.push({ t: "num", v: n });
      continue;
    }

    // Identifier (options, globals, ref, local, A, B, etc.)
    if (isAlpha(c)) {
      let buf = c;
      i++;
      while (i < s.length && isAlnum(s[i])) {
        buf += s[i];
        i++;
      }
      out.push({ t: "id", v: buf });
      continue;
    }

    throw new Error(`Unexpected char '${c}' in expr: ${s}`);
  }

  // Gestion du unaire "-" : transformer "-x" en "0 - x" si nécessaire (simple)
  return normalizeUnaryMinus(out);
}

function normalizeUnaryMinus(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.t === "op" && tk.v === "-") {
      const prev = out[out.length - 1];
      const isUnary =
        !prev ||
        prev.t === "op" ||
        prev.t === "lp" ||
        prev.t === "comma";
      if (isUnary) {
        out.push({ t: "num", v: 0 });
      }
    }
    out.push(tk);
  }
  return out;
}

function precedence(op: "+" | "-" | "*" | "/"): number {
  if (op === "*" || op === "/") return 2;
  return 1;
}

function toRpn(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const ops: Token[] = [];

  for (const tk of tokens) {
    if (tk.t === "num" || tk.t === "id" || tk.t === "str" || tk.t === "dot") {
      output.push(tk);
      continue;
    }
    if (tk.t === "op") {
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top.t === "op" && precedence(top.v) >= precedence(tk.v)) {
          output.push(ops.pop()!);
          continue;
        }
        break;
      }
      ops.push(tk);
      continue;
    }
    if (tk.t === "lp") {
      ops.push(tk);
      continue;
    }
    if (tk.t === "rp") {
      while (ops.length > 0 && ops[ops.length - 1].t !== "lp") {
        output.push(ops.pop()!);
      }
      if (ops.length === 0) throw new Error("Mismatched parentheses");
      ops.pop(); // consume lp
      continue;
    }
    if (tk.t === "comma") {
      // MVP: ignore commas (arguments parsing handled differently)
      output.push(tk);
      continue;
    }
  }

  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.t === "lp" || top.t === "rp") throw new Error("Mismatched parentheses");
    output.push(top);
  }

  return output;
}

/**
 * Eval RPN
 * On supporte:
 * - opérations + - * /
 * - résolution d'identifiants simples:
 *   - options.xxx, globals.xxx
 *   - ref("path").px etc.
 *   - local(n).px etc.
 * - accès via dot: on le gère en lisant séquentiellement "id dot id" au runtime
 *
 * Astuce:
 * - On ne fait pas un AST complet; on fait un petit interpréteur "par patterns"
 */
function evalRpn(rpn: Token[], env: EvalEnv): any {
  // Pour gérer "dot", on va d'abord reconstruire une forme "segments"
  // Exemple tokens: id(ref) lp str("root/1") rp dot id(px)
  // Ici, notre RPN n'a pas gardé les LP/RP dans output, donc on gère autrement:
  //
  // => Pour MVP, on supporte:
  //    - options.xxx (token: id options, dot, id xxx)
  //    - globals.xxx
  //    - local(<num>).px : pattern local, lp, num, rp, dot, id
  //    - ref(<str>).px : pattern ref, lp, str, rp, dot, id
  //
  // Comme on a shunting-yard sans fonctions, on va traiter avant shunting-yard:
  // => Solution MVP: si l'expression contient "ref(" ou "local(", on parse en "callChain"
  const s = rpnToString(rpn);
  if (s.includes("ref(") || s.includes("local(") || s.includes("options.") || s.includes("globals.")) {
    // fallback mini parser "call chains" + arithmetic
    return evalWithChains(s, env);
  }

  // Sinon eval simple stack arithmétique (num uniquement)
  const stack: number[] = [];
  for (const tk of rpn) {
    if (tk.t === "num") {
      stack.push(tk.v);
      continue;
    }
    if (tk.t === "op") {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error("Bad expression");
      if (tk.v === "+") stack.push(a + b);
      if (tk.v === "-") stack.push(a - b);
      if (tk.v === "*") stack.push(a * b);
      if (tk.v === "/") stack.push(a / b);
      continue;
    }
    // ids non gérés ici
    if (tk.t === "id") {
      // essayer globals direct (ex: "diam")
      const gv = (env.ctx.globals as any)[tk.v];
      if (typeof gv === "number") stack.push(gv);
      else {
        const n = Number(gv);
        if (Number.isFinite(n)) stack.push(n);
        else throw new Error(`Unknown identifier: ${tk.v}`);
      }
      continue;
    }
  }
  if (stack.length !== 1) throw new Error("Bad expression (stack)");
  return stack[0];
}

function rpnToString(rpn: Token[]): string {
  // util debug/fallback
  return rpn.map(t => (t.t === "num" ? String(t.v) : (t as any).v ?? t.t)).join(" ");
}

// -----------------------------
// Chain parser for ref/local/options/globals + arithmetic
// -----------------------------

/**
 * MVP chain evaluation:
 * - remplace les occurrences de:
 *    options.xxx -> valeur
 *    globals.xxx -> valeur
 *    ref("path").prop -> valeur
 *    local(n).prop -> valeur (dans la même instance)
 * - puis évalue l'arithmétique (*+-/()) via notre tokenizer+RPN sur une expression purement numérique
 *
 * Remarque: pour le moment, prop peut être:
 *   px py pz rx ry rz A B C ...
 */
function evalWithChains(expr: string, env: EvalEnv): any {
  let s = expr.trim().replace(/^=/, "");


  // 1) options.xxx
  s = s.replace(/\boptions\.([A-Za-z_][A-Za-z0-9_]*)\b/g, (_, key) => {
    const v = (env.ctx.options as any)[key];
    return formatScalar(v);
  });

  // 2) globals.xxx
  s = s.replace(/\bglobals\.([A-Za-z_][A-Za-z0-9_]*)\b/g, (_, key) => {
    const v = (env.ctx.globals as any)[key];
    return formatScalar(v);
  });
  // 2.5) repeat index i
  s = s.replace(/\bi\b/g, () => formatScalar(env.i ?? 0));
  // 3) local(n).prop
  s = s.replace(
    /\blocal\(\s*(\d+)\s*\)\.([A-Za-z_][A-Za-z0-9_]*)\b/g,
    (_, itemNumStr, prop) => {
      const itemNum = Number(itemNumStr);
      const path = `${env.instance.path}/${itemNum}`;
      const obj = env.ctx.objectRegistry.get(path);
      if (!obj) throw new Error(`local(${itemNum}) not resolved yet at ${env.instance.path}`);
      return formatScalar(readProp(obj, prop));
    }
  );

  // 4bis) ref(prev/1).prop
  s = s.replace(/\bref\(\s*prev\/(\d+)\s*\)\.([A-Za-z_][A-Za-z0-9_]*)\b/g, (_, itemNumStr, prop) => {
    const itemNum = Number(itemNumStr);
    const prevPath = env.prevInstancePath;
    if (!prevPath) throw new Error(`ref(prev/${itemNum}) used but prevInstancePath is missing`);
    const path = `${prevPath}/${itemNum}`;
    const obj = env.ctx.objectRegistry.get(path);
    if (!obj) throw new Error(`ref(prev/${itemNum}) -> '${path}' not found`);
    return formatScalar(readProp(obj, prop));
  });


  // 4) ref(path).prop (path non-quoté, ex: ref(prev/1).A)
  s = s.replace(
    /\bref\(\s*([A-Za-z0-9_\/[\]\.\-]+)\s*\)\.([A-Za-z_][A-Za-z0-9_]*)\b/g,
    (_, rawPath, prop) => {
      let path = String(rawPath).trim();

      // support "prev" => prevInstancePath + suffix
      if (path.startsWith("prev")) {
        if (!env.prevInstancePath) {
          throw new Error(`ref(prev) used but prevInstancePath is null at ${env.instance.path}`);
        }
        const suffix = path.length === 4 ? "" : path.slice(4); // after 'prev'
        path = env.prevInstancePath + (suffix.startsWith("/") || suffix === "" ? suffix : "/" + suffix);
      }

      const obj = env.ctx.objectRegistry.get(path);
      if (!obj) throw new Error(`ref(${rawPath}) not found (resolved path='${path}')`);
      return formatScalar(readProp(obj, prop));
    }
  );

  // 5) ref("path").prop (quoté)
  s = s.replace(
    /\bref\(\s*["']([^"']+)["']\s*\)\.([A-Za-z_][A-Za-z0-9_]*)\b/g,
    (_, path, prop) => {
      const obj = env.ctx.objectRegistry.get(path);
      if (!obj) throw new Error(`ref("${path}") not found`);
      return formatScalar(readProp(obj, prop));
    }
  );

  // 6) Expression arithmétique finale
  const n = Number(s);
  if (Number.isFinite(n) && /^[+-]?\d+(\.\d+)?$/.test(s.trim())) return n;

  const tokens = tokenize(s);
  const rpn = toRpn(tokens);
  return evalRpnNumericOnly(rpn);
}


function evalRpnNumericOnly(rpn: Token[]): number {
  const stack: number[] = [];
  for (const tk of rpn) {
    if (tk.t === "num") {
      stack.push(tk.v);
      continue;
    }
    if (tk.t === "op") {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error("Bad numeric expression");
      if (tk.v === "+") stack.push(a + b);
      if (tk.v === "-") stack.push(a - b);
      if (tk.v === "*") stack.push(a * b);
      if (tk.v === "/") stack.push(a / b);
      continue;
    }
    if (tk.t === "id") {
      // identifiant résiduel non autorisé
      throw new Error(`Unresolved identifier in numeric expression: ${tk.v}`);
    }
  }
  if (stack.length !== 1) throw new Error("Bad numeric expression (stack)");
  return stack[0];
}

function resolveRefPath(env: EvalEnv, raw: string): string {
  const p = raw.trim();

  // 1) absolu (déjà ok)
  if (p.startsWith("root/") || p === "root") return p;

  // 2) relatif à l’instance courante
  // ex: env.instance.path = "root/modules[0]"
  // ref("fleche[0]/1") => "root/modules[0]/fleche[0]/1"
  return `${env.instance.path}/${p}`.replace(/\/+/g, "/");
}


function readProp(obj: ResolvedObject, prop: string): string | number {
  switch (prop) {
    case "px": return obj.origin.x;
    case "py": return obj.origin.y;
    case "pz": return obj.origin.z;
    case "rx": return obj.rotation.x;
    case "ry": return obj.rotation.y;
    case "rz": return obj.rotation.z;
    case "id": return obj.num;
    default:
      // Params A,B,C...
      if (prop.length === 1 && /[A-Z]/.test(prop)) {
        const v = obj.params[prop];
        const n = Number(v);
        return Number.isFinite(n) ? n : v;
      }
      // fallback: try params by key
      if (obj.params[prop] !== undefined) return obj.params[prop];
      throw new Error(`Unknown property: ${prop} on ${obj.objectPath}`);
  }
}

function formatScalar(v: any): string {
  if (v === null || v === undefined) return "0";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return String(v);
  const n = Number(v);
  if (Number.isFinite(n)) return String(n);
  // string non numérique: on ne peut pas l'injecter dans une expression arithmétique
  // pour MVP on la met entre quotes (mais notre tokenizer ne supporte pas bien strings arithmétiques).
  // Donc ici, on renvoie "0" et on laisse l'appelant utiliser evalString() si nécessaire.
  return "0";
}

// -----------------------------
// Helpers
// -----------------------------

function mustGet<K, V>(map: Map<K, V>, key: K, label: string): V {
  const v = map.get(key);
  if (!v) throw new Error(`Missing ${label} for key=${String(key)}`);
  return v;
}
