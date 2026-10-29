/**
 * VBA-operatoren met de typeregels van VBA: Integer * Integer blijft Integer
 * (met fout 6 bij overloop, of een groter type als een operand Variant is),
 * Null plant zich voort, & behandelt Null als lege tekst.
 */
import i18next from "i18next";
import { fout } from "./fouten.ts";
import type { Landinstelling } from "./land.ts";
import {
  Datum,
  Getal,
  Leeg,
  NULL,
  NullWaarde,
  binnenBereik,
  bankAfronden,
  maakGetal,
  naarBool,
  naarDatum,
  naarGetal,
  naarGetalWaarde,
  naarTekst,
  tekstNaarGetal,
  VbaObject,
  Niets,
  type GetalSoort,
  type VbaWaarde,
} from "./waarden.ts";

const RANG: Record<GetalSoort, number> = {
  Byte: 1,
  Integer: 2,
  Long: 3,
  Single: 4,
  Double: 5,
  Currency: 6,
  Decimal: 7,
};
const GROTER: Partial<Record<GetalSoort, GetalSoort>> = {
  Byte: "Integer",
  Integer: "Long",
  Long: "Double",
  Single: "Double",
  Currency: "Double",
};

/** Resultaattype van + - * voor twee getaltypen. */
function samen(a: GetalSoort, b: GetalSoort): GetalSoort {
  if (a === "Currency" || b === "Currency") {
    const ander = a === "Currency" ? b : a;
    return ander === "Single" || ander === "Double" ? "Double" : "Currency";
  }
  if (a === "Decimal" || b === "Decimal") return "Decimal";
  if ((a === "Long" && b === "Single") || (a === "Single" && b === "Long")) return "Double";
  return RANG[a] >= RANG[b] ? a : b;
}

/** Maakt het resultaat; bij overloop met een Variant-operand groeit het type mee. */
function resultaat(soort: GetalSoort, x: number, variant: boolean): Getal {
  let s = soort;
  for (;;) {
    let w = x;
    if (s === "Single") w = Math.fround(x);
    if (binnenBereik(s, w)) return maakGetal(s, w, variant);
    if (!variant || !GROTER[s]) throw fout(6);
    s = GROTER[s]!;
  }
}

const isTekst = (w: VbaWaarde): w is string => typeof w === "string";

export function rekenkundig(op: string, a: VbaWaarde, b: VbaWaarde, land: Landinstelling): VbaWaarde {
  if (a instanceof NullWaarde || b instanceof NullWaarde) return NULL;
  if (a instanceof VbaObject || b instanceof VbaObject || a instanceof Niets || b instanceof Niets) throw fout(13);
  if (op === "+") {
    if (isTekst(a) && isTekst(b)) return a + b;
    if (isTekst(a) && b instanceof Leeg) return a;
    if (isTekst(b) && a instanceof Leeg) return b;
  }
  // Datumrekenen
  if (a instanceof Datum || b instanceof Datum) {
    if (op === "+" || op === "-") {
      const x = naarDatum(a, land);
      const y = naarDatum(b, land);
      const r = op === "+" ? x + y : x - y;
      if (op === "-" && a instanceof Datum && b instanceof Datum) return new Getal("Double", r, true);
      if (!Number.isFinite(r) || r < -657434 || r > 2958465.99999) throw fout(6);
      return new Datum(r);
    }
  }
  const x = naarGetalWaarde(a, land);
  const y = naarGetalWaarde(b, land);
  const variant = x.variant || y.variant;
  switch (op) {
    case "+":
      return resultaat(samen(x.soort, y.soort), x.w + y.w, variant);
    case "-":
      return resultaat(samen(x.soort, y.soort), x.w - y.w, variant);
    case "*":
      return resultaat(samen(x.soort, y.soort), x.w * y.w, variant);
    case "/": {
      if (y.w === 0) {
        if (x.w === 0) throw fout(6);
        throw fout(11);
      }
      const klein = (s: GetalSoort) => s === "Byte" || s === "Integer" || s === "Single";
      const soort: GetalSoort = klein(x.soort) && klein(y.soort) ? "Single" : x.soort === "Decimal" || y.soort === "Decimal" ? "Decimal" : "Double";
      return resultaat(soort, x.w / y.w, variant);
    }
    case "\\":
    case "mod": {
      const soort: GetalSoort =
        (x.soort === "Byte" || x.soort === "Integer") && (y.soort === "Byte" || y.soort === "Integer")
          ? x.soort === "Byte" && y.soort === "Byte"
            ? "Byte"
            : "Integer"
          : "Long";
      const l = bankAfronden(x.w);
      const r = bankAfronden(y.w);
      if (!binnenBereik("Long", l) || !binnenBereik("Long", r)) throw fout(6);
      if (r === 0) throw fout(11);
      const uitkomst = op === "\\" ? Math.trunc(l / r) : l % r;
      return resultaat(soort, uitkomst === 0 ? 0 : uitkomst, variant);
    }
    case "^": {
      if (x.w < 0 && !Number.isInteger(y.w)) throw fout(5);
      if (x.w === 0 && y.w < 0) throw fout(5);
      return resultaat("Double", x.w ** y.w, variant);
    }
  }
  throw fout(5);
}

export function samenvoegen(a: VbaWaarde, b: VbaWaarde, land: Landinstelling): VbaWaarde {
  if (a instanceof NullWaarde && b instanceof NullWaarde) return NULL;
  const t = (w: VbaWaarde) => (w instanceof NullWaarde ? "" : naarTekst(w, land));
  return t(a) + t(b);
}

export function negatief(a: VbaWaarde, land: Landinstelling): VbaWaarde {
  if (a instanceof NullWaarde) return NULL;
  if (a instanceof Datum) return new Datum(-a.w);
  const x = naarGetalWaarde(a, land);
  return resultaat(x.soort, -x.w, x.variant);
}

export type Vergelijking = "binary" | "text" | "database";

/** Vergelijkt twee waarden: -1, 0, 1 of null (bij Null). */
export function vergelijk(a: VbaWaarde, b: VbaWaarde, modus: Vergelijking, land: Landinstelling): number | null {
  if (a instanceof NullWaarde || b instanceof NullWaarde) return null;
  if (a instanceof VbaObject || b instanceof VbaObject || a instanceof Niets || b instanceof Niets) throw fout(13);
  if (a instanceof Leeg && b instanceof Leeg) return 0;
  const tekstA = isTekst(a);
  const tekstB = isTekst(b);
  if ((tekstA || a instanceof Leeg) && (tekstB || b instanceof Leeg)) {
    return vergelijkTekst(tekstA ? a : "", tekstB ? b : "", modus);
  }
  if (tekstA || tekstB) {
    // Getal tegenover tekst: lukt omzetten niet, dan is een getal kleiner dan tekst.
    const tekst = (tekstA ? a : b) as string;
    const ander = tekstA ? b : a;
    let n: number | null;
    if (ander instanceof Datum) {
      try {
        n = naarDatum(tekst, land);
      } catch {
        n = null;
      }
    } else n = tekstNaarGetal(tekst, land);
    if (n === null) {
      if (typeof ander === "boolean") {
        const bt = naarBool(tekst, land);
        const x = ander ? -1 : 0;
        const y = bt ? -1 : 0;
        return tekstA ? Math.sign(y - x) : Math.sign(x - y);
      }
      return tekstA ? 1 : -1;
    }
    const x = naarGetal(ander, land);
    return tekstA ? Math.sign(n - x) || 0 : Math.sign(x - n) || 0;
  }
  const x = naarGetal(a, land);
  const y = naarGetal(b, land);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function vergelijkTekst(a: string, b: string, modus: Vergelijking): number {
  if (modus !== "binary") {
    a = a.toLocaleLowerCase();
    b = b.toLocaleLowerCase();
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export function vergelijkOp(op: string, a: VbaWaarde, b: VbaWaarde, modus: Vergelijking, land: Landinstelling): VbaWaarde {
  const c = vergelijk(a, b, modus, land);
  if (c === null) return NULL;
  switch (op) {
    case "=":
      return c === 0;
    case "<>":
      return c !== 0;
    case "<":
      return c < 0;
    case ">":
      return c > 0;
    case "<=":
      return c <= 0;
    case ">=":
      return c >= 0;
  }
  throw fout(5);
}

/** `Like`: * ? # [a-z] [!a-z] */
export function lijktOp(tekst: string, patroon: string, modus: Vergelijking): boolean {
  let re = "^";
  for (let i = 0; i < patroon.length; i++) {
    const c = patroon[i];
    if (c === "*") re += "[\\s\\S]*";
    else if (c === "?") re += "[\\s\\S]";
    else if (c === "#") re += "\\d";
    else if (c === "[") {
      const eind = patroon.indexOf("]", i + 1);
      if (eind < 0) throw fout(93, i18next.t("vba:operators.invalidLikePattern"));
      let inhoud = patroon.slice(i + 1, eind);
      let ontkend = false;
      if (inhoud.startsWith("!")) {
        ontkend = true;
        inhoud = inhoud.slice(1);
      }
      if (inhoud === "") re += ontkend ? "[\\s\\S]" : "";
      else re += `[${ontkend ? "^" : ""}${inhoud.replace(/[\\\]^]/g, "\\$&")}]`;
      i = eind;
    } else re += c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  }
  re += "$";
  return new RegExp(re, modus === "binary" ? "u" : "iu").test(tekst);
}

function geheelVoorLogica(w: VbaWaarde, land: Landinstelling): number {
  if (typeof w === "boolean") return w ? -1 : 0;
  const n = naarGetal(w, land);
  const r = bankAfronden(n);
  if (!binnenBereik("Long", r)) throw fout(6);
  return r;
}

/** And, Or, Xor, Eqv, Imp, met de VBA-regels voor Null. */
export function logisch(op: string, a: VbaWaarde, b: VbaWaarde, land: Landinstelling): VbaWaarde {
  const nullA = a instanceof NullWaarde;
  const nullB = b instanceof NullWaarde;
  if (nullA || nullB) {
    const ander = nullA ? b : a;
    if (nullA && nullB) return NULL;
    const v = geheelVoorLogica(ander, land);
    if (op === "and" && v === 0) return typeof ander === "boolean" ? false : maakGetal("Integer", 0);
    if (op === "or" && v === -1) return typeof ander === "boolean" ? true : maakGetal("Integer", -1);
    if (op === "imp" && nullA && v === -1) return typeof ander === "boolean" ? true : maakGetal("Integer", -1);
    if (op === "imp" && nullB && v === 0) return typeof ander === "boolean" ? true : maakGetal("Integer", -1);
    return NULL;
  }
  const beideBool = typeof a === "boolean" && typeof b === "boolean";
  const x = geheelVoorLogica(a, land);
  const y = geheelVoorLogica(b, land);
  let r: number;
  switch (op) {
    case "and":
    case "andalso":
      r = x & y;
      break;
    case "or":
    case "orelse":
      r = x | y;
      break;
    case "xor":
      r = x ^ y;
      break;
    case "eqv":
      r = ~(x ^ y);
      break;
    case "imp":
      r = ~x | y;
      break;
    default:
      throw fout(5);
  }
  if (beideBool) return r !== 0;
  const soort: GetalSoort =
    (a instanceof Getal && a.soort === "Long") || (b instanceof Getal && b.soort === "Long") || !binnenBereik("Integer", r)
      ? "Long"
      : "Integer";
  return maakGetal(soort, r);
}

export function niet(a: VbaWaarde, land: Landinstelling): VbaWaarde {
  if (a instanceof NullWaarde) return NULL;
  if (typeof a === "boolean") return !a;
  const x = geheelVoorLogica(a, land);
  const soort: GetalSoort = a instanceof Getal && (a.soort === "Integer" || a.soort === "Byte") ? "Integer" : "Long";
  return maakGetal(soort, ~x);
}
