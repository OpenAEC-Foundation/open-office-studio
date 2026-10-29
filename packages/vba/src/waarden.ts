/**
 * Waardemodel van VBA: Variant met subtypen, Empty/Null/Nothing, getallen met
 * hun eigen type (voor overloop en TypeName), datums, matrices, records (Type)
 * en objecten. Conversies volgen de VBA-regels, inclusief bankiersafronding.
 */
import i18next from "i18next";
import { combineer, delenVan, leesDatum, splits } from "./datum.ts";
import { fout } from "./fouten.ts";
import { NEDERLANDS, type Landinstelling } from "./land.ts";

export class Leeg {
  toString() {
    return "Empty";
  }
}
export class NullWaarde {
  toString() {
    return "Null";
  }
}
export class Niets {
  toString() {
    return "Nothing";
  }
}
/** Weggelaten optioneel Variant-argument (IsMissing). */
export class Ontbrekend {}
export const LEEG = new Leeg();
export const NULL = new NullWaarde();
export const NIETS = new Niets();
export const ONTBREEKT = new Ontbrekend();

export type GetalSoort = "Byte" | "Integer" | "Long" | "Single" | "Double" | "Currency" | "Decimal";

export class Getal {
  constructor(
    readonly soort: GetalSoort,
    readonly w: number,
    /** Komt uit een Variant: bij overloop wordt het type groter in plaats van fout 6. */
    readonly variant = false,
  ) {}
  alsVariant() {
    return this.variant ? this : new Getal(this.soort, this.w, true);
  }
}

export class Datum {
  constructor(readonly w: number) {}
}

/** Foutwaarde (CVErr). */
export class Foutwaarde {
  constructor(readonly nummer: number) {}
}

export interface Cel {
  w: VbaWaarde;
  /** Gedeclareerd type; "Variant" accepteert alles. */
  readonly type: string;
  readonly vasteLengte?: number;
}

export class GewoneCel implements Cel {
  constructor(
    public w: VbaWaarde,
    readonly type: string = "Variant",
    readonly vasteLengte?: number,
  ) {}
}

export interface MatrixGrens {
  onder: number;
  boven: number;
}

export class VbaMatrix {
  constructor(
    public grenzen: MatrixGrens[],
    public data: VbaWaarde[],
    readonly elementType: string,
    /** Vaste grootte (`Dim a(5)`), niet te ReDimmen. */
    readonly vast = false,
    readonly vasteLengte?: number,
  ) {}
  get toegewezen() {
    return this.grenzen.length > 0;
  }
  index(indices: number[]): number {
    if (!this.toegewezen || indices.length !== this.grenzen.length) throw fout(9);
    let positie = 0;
    let factor = 1;
    for (let d = 0; d < indices.length; d++) {
      const g = this.grenzen[d];
      const i = indices[d];
      if (i < g.onder || i > g.boven) throw fout(9);
      positie += (i - g.onder) * factor;
      factor *= g.boven - g.onder + 1;
    }
    return positie;
  }
  cel(indices: number[]): Cel {
    const positie = this.index(indices);
    const matrix = this;
    return {
      get w() {
        return matrix.data[positie];
      },
      set w(v: VbaWaarde) {
        matrix.data[positie] = v;
      },
      type: this.elementType,
      vasteLengte: this.vasteLengte,
    };
  }
  kopie(): VbaMatrix {
    return new VbaMatrix(
      this.grenzen.map((g) => ({ ...g })),
      this.data.map(kopieerWaarde),
      this.elementType,
      false,
      this.vasteLengte,
    );
  }
}

/** Gebruikersgedefinieerd type (`Type … End Type`): waardetype, wordt gekopieerd. */
export class VbaRecord {
  constructor(
    readonly typeNaam: string,
    readonly velden: Map<string, { naam: string; cel: GewoneCel }>,
  ) {}
  kopie(): VbaRecord {
    return new VbaRecord(
      this.typeNaam,
      new Map(
        [...this.velden].map(([k, v]) => [
          k,
          { naam: v.naam, cel: new GewoneCel(kopieerWaarde(v.cel.w), v.cel.type, v.cel.vasteLengte) },
        ]),
      ),
    );
  }
}

/**
 * Basis voor alle objecten (DAO, Access, Collection, klasse-instanties).
 * Leden worden hoofdletterongevoelig opgezocht; `naam` is altijd in kleine letters.
 */
export abstract class VbaObject {
  abstract readonly typeNaam: string;
  /** Eigenschap lezen of methode aanroepen. */
  async lid(naam: string, args: VbaWaarde[], _rt: unknown): Promise<VbaWaarde> {
    void args;
    void _rt;
    throw fout(438, i18next.t("vba:runtime.noPropertyOrMethod", { object: this.typeNaam, name: naam }));
  }
  /** Eigenschap schrijven (Let of Set). */
  async zetLid(naam: string, args: VbaWaarde[], waarde: VbaWaarde, _rt: unknown): Promise<void> {
    void args;
    void waarde;
    void _rt;
    throw fout(438, i18next.t("vba:values.cannotSet", { member: `${this.typeNaam}.${naam}` }));
  }
  /** Standaardlid, bv. Field.Value of Collection.Item. */
  async standaard(args: VbaWaarde[], rt: unknown): Promise<VbaWaarde> {
    void args;
    void rt;
    throw fout(438, i18next.t("vba:values.noDefaultProperty", { object: this.typeNaam }));
  }
  async zetStandaard(args: VbaWaarde[], waarde: VbaWaarde, rt: unknown): Promise<void> {
    void args;
    void waarde;
    void rt;
    throw fout(438, i18next.t("vba:values.noSettableDefaultProperty", { object: this.typeNaam }));
  }
  /** `obj!naam` — standaard: standaardlid met de naam als argument. */
  async bang(naam: string, rt: unknown): Promise<VbaWaarde> {
    return this.standaard([naam], rt);
  }
  async zetBang(naam: string, waarde: VbaWaarde, rt: unknown): Promise<void> {
    const doel = await this.bang(naam, rt);
    if (doel instanceof VbaObject) return doel.zetStandaard([], waarde, rt);
    throw fout(438);
  }
  /** Elementen voor For Each. */
  async elementen(_rt: unknown): Promise<VbaWaarde[]> {
    void _rt;
    throw fout(438, i18next.t("vba:values.forEachNotSupported", { object: this.typeNaam }));
  }
  /** Heeft dit object een standaardwaarde die bij een Let-toewijzing gelezen wordt? */
  heeftStandaardwaarde() {
    return false;
  }
  /** Is dit object van type `naam` (TypeOf … Is)? */
  isType(naam: string) {
    return naam.toLowerCase().split(".").pop() === this.typeNaam.toLowerCase() || naam.toLowerCase() === "object";
  }
}

export type VbaWaarde =
  | Leeg
  | NullWaarde
  | Niets
  | Ontbrekend
  | Foutwaarde
  | boolean
  | string
  | Getal
  | Datum
  | VbaMatrix
  | VbaRecord
  | VbaObject;

export function kopieerWaarde(w: VbaWaarde): VbaWaarde {
  if (w instanceof VbaMatrix) return w.kopie();
  if (w instanceof VbaRecord) return w.kopie();
  return w;
}

// ---------- constructoren ----------
export const int = (n: number) => new Getal("Integer", n);
export const lng = (n: number) => new Getal("Long", n);
export const dbl = (n: number) => new Getal("Double", n);
export const sng = (n: number) => new Getal("Single", Math.fround(n));
export const cur = (n: number) => new Getal("Currency", rondAf(n, 4));

// ---------- afronding en bereik ----------

/** Bankiersafronding (half naar even), met tolerantie voor binaire breuken. */
export function bankAfronden(x: number): number {
  if (Number.isInteger(x)) return x;
  const vloer = Math.floor(x);
  const rest = x - vloer;
  const eps = 1e-12 * Math.max(1, Math.abs(x));
  if (Math.abs(rest - 0.5) <= eps) return vloer % 2 === 0 ? vloer : vloer + 1;
  return Math.round(x);
}

export function rondAf(x: number, decimalen: number): number {
  if (decimalen <= 0) return bankAfronden(x);
  const f = 10 ** decimalen;
  // Werk via een decimale tekst om 2.675 * 100 = 267.49999 te vermijden.
  const geschaald = Number((x * f).toPrecision(15));
  return bankAfronden(geschaald) / f;
}

const BEREIK: Record<string, [number, number]> = {
  Byte: [0, 255],
  Integer: [-32768, 32767],
  Long: [-2147483648, 2147483647],
  Currency: [-922337203685477.5808, 922337203685477.5807],
  Single: [-3.402823466e38, 3.402823466e38],
  Double: [-Number.MAX_VALUE, Number.MAX_VALUE],
  Decimal: [-7.9228162514264337593543950335e28, 7.9228162514264337593543950335e28],
};

export function binnenBereik(soort: GetalSoort, x: number) {
  const [min, max] = BEREIK[soort];
  return Number.isFinite(x) && x >= min && x <= max;
}

/** Maakt een getal van een soort; buiten bereik → fout 6. */
export function maakGetal(soort: GetalSoort, x: number, variant = false): Getal {
  if (soort === "Byte" || soort === "Integer" || soort === "Long") x = bankAfronden(x);
  else if (soort === "Currency") x = rondAf(x, 4);
  else if (soort === "Single") x = Math.fround(x);
  if (!binnenBereik(soort, x)) throw fout(6);
  if (Object.is(x, -0)) x = 0;
  return new Getal(soort, x, variant);
}

// ---------- typevragen ----------

export const isNull = (w: VbaWaarde) => w instanceof NullWaarde;
export const isLeeg = (w: VbaWaarde) => w instanceof Leeg;
export const isObject = (w: VbaWaarde): w is VbaObject => w instanceof VbaObject;

export function typeNaam(w: VbaWaarde): string {
  if (w instanceof Leeg) return "Empty";
  if (w instanceof NullWaarde) return "Null";
  if (w instanceof Niets) return "Nothing";
  if (w instanceof Ontbrekend) return "Error";
  if (w instanceof Foutwaarde) return "Error";
  if (typeof w === "boolean") return "Boolean";
  if (typeof w === "string") return "String";
  if (w instanceof Getal) return w.soort;
  if (w instanceof Datum) return "Date";
  if (w instanceof VbaMatrix) {
    const t = w.elementType === "Variant" ? "Variant" : w.elementType;
    return `${t}()`;
  }
  if (w instanceof VbaRecord) return w.typeNaam;
  return w.typeNaam;
}

const VARTYPE: Record<string, number> = {
  Empty: 0,
  Null: 1,
  Integer: 2,
  Long: 3,
  Single: 4,
  Double: 5,
  Currency: 6,
  Date: 7,
  String: 8,
  Object: 9,
  Error: 10,
  Boolean: 11,
  Variant: 12,
  Decimal: 14,
  Byte: 17,
};

export function varType(w: VbaWaarde): number {
  if (w instanceof VbaMatrix) return 8192 + (VARTYPE[w.elementType] ?? 12);
  if (w instanceof VbaObject || w instanceof Niets) return 9;
  if (w instanceof VbaRecord) return 36;
  return VARTYPE[typeNaam(w)] ?? 12;
}

// ---------- conversies ----------

/** Leest een getal uit tekst zoals VBA dat doet (met decimaal- en duizendtalteken). */
export function tekstNaarGetal(tekst: string, land: Landinstelling): number | null {
  let t = tekst.trim();
  if (!t) return null;
  const hex = /^&([hHoO])([0-9A-Fa-f]+)&?$/.exec(t);
  if (hex) {
    const n = parseInt(hex[2], hex[1].toLowerCase() === "h" ? 16 : 8);
    return Number.isNaN(n) ? null : n > 0x7fffffff ? n - 0x100000000 : n <= 0xffff && n > 0x7fff ? n - 0x10000 : n;
  }
  let negatief = false;
  if (/^\(.*\)$/.test(t)) {
    negatief = true;
    t = t.slice(1, -1).trim();
  }
  if (land.valuta && t.includes(land.valuta)) t = t.replace(land.valuta, "").trim();
  if (/-$/.test(t)) {
    negatief = !negatief;
    t = t.slice(0, -1).trim();
  }
  const d = land.decimaal;
  const k = land.duizendtal;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patroon = new RegExp(
    `^([+-])?\\s*(\\d[\\d${esc(k)}]*)?(?:${esc(d)}(\\d*))?(?:[eEdD]([+-]?\\d+))?$`,
  );
  const m = patroon.exec(t);
  if (!m || (m[2] === undefined && !m[3])) return null;
  const geheel = (m[2] ?? "0").split(k).join("");
  const getal = Number(`${geheel}.${m[3] || "0"}e${m[4] ?? "0"}`);
  if (!Number.isFinite(getal)) return null;
  const waarde = m[1] === "-" ? -getal : getal;
  return negatief ? -waarde : waarde;
}

/** Getal uit een waarde voor rekenen; Null → fout 94, onleesbaar → fout 13. */
export function naarGetal(w: VbaWaarde, land: Landinstelling = NEDERLANDS): number {
  if (w instanceof Getal) return w.w;
  if (typeof w === "boolean") return w ? -1 : 0;
  if (w instanceof Leeg) return 0;
  if (w instanceof Datum) return w.w;
  if (typeof w === "string") {
    const n = tekstNaarGetal(w, land);
    if (n === null) throw fout(13);
    return n;
  }
  if (w instanceof NullWaarde) throw fout(94);
  throw fout(13);
}

/** Getal met VBA-type, voor de rekenoperatoren. Tekst wordt Double. */
export function naarGetalWaarde(w: VbaWaarde, land: Landinstelling): Getal {
  if (w instanceof Getal) return w;
  if (typeof w === "boolean") return new Getal("Integer", w ? -1 : 0, true);
  if (w instanceof Leeg) return new Getal("Integer", 0, true);
  if (typeof w === "string") return new Getal("Double", naarGetal(w, land), true);
  if (w instanceof Datum) return new Getal("Double", w.w, true);
  return new Getal("Double", naarGetal(w, land));
}

/** Getal als tekst zoals CStr/Debug.Print het tonen (max. 15 cijfers, of 7 bij Single). */
export function getalNaarTekst(x: number, soort: GetalSoort, land: Landinstelling = NEDERLANDS): string {
  let t: string;
  if (Number.isInteger(x) && Math.abs(x) < 1e15) t = String(x);
  else {
    const cijfers = soort === "Single" ? 7 : 15;
    const abs = Math.abs(x);
    if (abs !== 0 && (abs >= 10 ** cijfers || abs < 1e-4) && soort !== "Currency") {
      const [mant, exp] = x.toExponential(cijfers - 1).split("e");
      const m = mant.replace(/\.?0+$/, "");
      const e = Number(exp);
      t = `${m}E${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
    } else {
      t = Number(x.toPrecision(cijfers)).toString();
      if (/e/.test(t)) t = Number(x.toPrecision(cijfers)).toFixed(20).replace(/\.?0+$/, "");
    }
  }
  return t.replace(".", land.decimaal);
}

export function datumNaarTekst(serie: number, land: Landinstelling): string {
  const { dagen, tijd } = splits(serie);
  const d = delenVan(serie);
  const datumTekst = korteDatum(d, land);
  const tijdTekst = langeTijd(d, land);
  if (dagen === 0) return tijdTekst;
  if (tijd === 0) return datumTekst;
  return `${datumTekst} ${tijdTekst}`;
}

export function korteDatum(d: { jaar: number; maand: number; dag: number }, land: Landinstelling) {
  const p = (n: number) => (land.korteDatumNullen ? String(n).padStart(2, "0") : String(n));
  const j = String(d.jaar).padStart(4, "0");
  const s = land.datumScheiding;
  if (land.datumVolgorde === "mdy") return `${p(d.maand)}${s}${p(d.dag)}${s}${j}`;
  if (land.datumVolgorde === "ymd") return `${j}${s}${String(d.maand).padStart(2, "0")}${s}${String(d.dag).padStart(2, "0")}`;
  return `${p(d.dag)}${s}${p(d.maand)}${s}${j}`;
}

export function langeTijd(d: { uur: number; minuut: number; seconde: number }, land: Landinstelling) {
  const s = land.tijdScheiding;
  const p = (n: number) => String(n).padStart(2, "0");
  if (land.uur24) return `${d.uur}${s}${p(d.minuut)}${s}${p(d.seconde)}`;
  const u = d.uur % 12 || 12;
  return `${u}${s}${p(d.minuut)}${s}${p(d.seconde)} ${d.uur < 12 ? "AM" : "PM"}`;
}

export function naarTekst(w: VbaWaarde, land: Landinstelling = NEDERLANDS): string {
  if (typeof w === "string") return w;
  if (w instanceof Leeg) return "";
  if (typeof w === "boolean") return w ? land.waar : land.onwaar;
  if (w instanceof Getal) return getalNaarTekst(w.w, w.soort, land);
  if (w instanceof Datum) return datumNaarTekst(w.w, land);
  if (w instanceof NullWaarde) throw fout(94);
  if (w instanceof Foutwaarde) return `Error ${w.nummer}`;
  throw fout(13);
}

export function naarBool(w: VbaWaarde, land: Landinstelling = NEDERLANDS): boolean {
  if (typeof w === "boolean") return w;
  if (w instanceof Getal) return w.w !== 0;
  if (w instanceof Leeg) return false;
  if (w instanceof Datum) return w.w !== 0;
  if (typeof w === "string") {
    const k = w.trim().toLowerCase();
    if (k === "true" || k === land.waar.toLowerCase() || k === "waar") return true;
    if (k === "false" || k === land.onwaar.toLowerCase() || k === "onwaar") return false;
    const n = tekstNaarGetal(w, land);
    if (n === null) throw fout(13);
    return n !== 0;
  }
  if (w instanceof NullWaarde) throw fout(94);
  throw fout(13);
}

export function naarDatum(w: VbaWaarde, land: Landinstelling = NEDERLANDS): number {
  if (w instanceof Datum) return w.w;
  if (w instanceof Getal) return w.w;
  if (typeof w === "boolean") return w ? -1 : 0;
  if (w instanceof Leeg) return 0;
  if (typeof w === "string") {
    const d = leesDatum(w, land.datumVolgorde);
    if (d !== null) return d;
    const n = tekstNaarGetal(w, land);
    if (n !== null) return n;
    throw fout(13);
  }
  if (w instanceof NullWaarde) throw fout(94);
  throw fout(13);
}

export const GETALTYPEN = new Set(["byte", "integer", "long", "single", "double", "currency", "decimal", "longlong", "longptr"]);

export function normaalType(naam: string): string {
  const k = naam.toLowerCase().replace(/^vba\./, "");
  switch (k) {
    case "byte":
      return "Byte";
    case "integer":
      return "Integer";
    case "long":
    case "longptr":
      return "Long";
    case "longlong":
      return "Double";
    case "single":
      return "Single";
    case "double":
      return "Double";
    case "currency":
      return "Currency";
    case "decimal":
      return "Decimal";
    case "string":
      return "String";
    case "boolean":
      return "Boolean";
    case "date":
      return "Date";
    case "variant":
    case "any":
      return "Variant";
    case "object":
      return "Object";
    default:
      return naam;
  }
}

export const EENVOUDIGE_TYPEN = new Set([
  "Byte",
  "Integer",
  "Long",
  "Single",
  "Double",
  "Currency",
  "Decimal",
  "String",
  "Boolean",
  "Date",
  "Variant",
]);

/** Beginwaarde van een variabele van dit type. */
export function standaardWaarde(type: string, vasteLengte?: number): VbaWaarde {
  switch (type) {
    case "Byte":
    case "Integer":
    case "Long":
    case "Single":
    case "Double":
    case "Currency":
    case "Decimal":
      return new Getal(type, 0);
    case "String":
      return vasteLengte ? " ".repeat(vasteLengte) : "";
    case "Boolean":
      return false;
    case "Date":
      return new Datum(0);
    case "Variant":
      return LEEG;
    default:
      return NIETS;
  }
}

/**
 * Zet een waarde om naar het gedeclareerde type van de doelvariabele
 * (Let-toewijzing). Objecten en records worden door de interpreter afgehandeld.
 */
export function naarType(w: VbaWaarde, type: string, land: Landinstelling, vasteLengte?: number): VbaWaarde {
  switch (type) {
    case "Variant":
      if (w instanceof Getal) return w.alsVariant();
      if (w instanceof Ontbrekend) return w;
      return kopieerWaarde(w);
    case "Byte":
    case "Integer":
    case "Long":
    case "Single":
    case "Double":
    case "Currency":
    case "Decimal": {
      if (w instanceof Getal && w.soort === type && !w.variant) return w;
      if (typeof w === "string") {
        const n = tekstNaarGetal(w, land);
        if (n === null) {
          const d = leesDatum(w, land.datumVolgorde);
          if (d === null) throw fout(13);
          return maakGetal(type, d);
        }
        return maakGetal(type, n);
      }
      return maakGetal(type, naarGetal(w, land));
    }
    case "String": {
      if (w instanceof Datum || w instanceof Getal || typeof w === "boolean" || typeof w === "string" || w instanceof Leeg) {
        const t = naarTekst(w, land);
        if (vasteLengte) return t.length >= vasteLengte ? t.slice(0, vasteLengte) : t + " ".repeat(vasteLengte - t.length);
        return t;
      }
      if (w instanceof NullWaarde) throw fout(94);
      throw fout(13);
    }
    case "Boolean":
      return naarBool(w, land);
    case "Date":
      return new Datum(naarDatum(w, land));
    default:
      return w;
  }
}

export { combineer };
