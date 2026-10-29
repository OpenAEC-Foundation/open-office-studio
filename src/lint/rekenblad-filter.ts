/**
 * AutoFilter voor rekenbladen (#62): criteria, rijen beoordelen, de stand per
 * werkboek en het `autoFilter`-element in de XLSX lezen en schrijven.
 *
 * De engine kent geen filtermodel. Hij bewaart een bestaand `autoFilter`
 * ongewijzigd en verbergt rijen met hoogte 0 (`hidden="1"`). Wij houden de
 * filterstand zelf bij, verbergen rijen via `setRowHeight` en schrijven het
 * element bij opslaan opnieuw. Puur, op de stand na.
 */
import type { XlsxCellValue } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  eindBegintag,
  elementen,
  kind,
  kinderen,
  leesXml,
  ontcijfer,
  ontsnap,
  rid,
  vervang,
  type Vervanging,
  type XmlElement,
} from "../grafieken/xml";
import { leesNederlands } from "../rekenbladinvoer";
import { bereikA1, kolomLetters, ontleedBereik, type Bereik } from "./rekenblad-logica";

export type Operator =
  | "gelijk"
  | "nietGelijk"
  | "groter"
  | "groterGelijk"
  | "kleiner"
  | "kleinerGelijk"
  | "begintMet"
  | "eindigtOp"
  | "bevat"
  | "bevatNiet";

export const OPERATOREN: readonly Operator[] = [
  "gelijk",
  "nietGelijk",
  "groter",
  "groterGelijk",
  "kleiner",
  "kleinerGelijk",
  "begintMet",
  "eindigtOp",
  "bevat",
  "bevatNiet",
];

export interface Voorwaarde {
  operator: Operator;
  waarde: string;
}

export type KolomFilter =
  /** Aangevinkte weergaveteksten; `leeg`: lege cellen tonen. */
  | { soort: "waarden"; waarden: string[]; leeg: boolean }
  | { soort: "voorwaarden"; en: boolean; voorwaarden: Voorwaarde[] }
  | { soort: "top"; aantal: number; bovenste: boolean; procent: boolean }
  /** Een filter uit het bestand dat we niet beoordelen (kleur, dynamisch, datumgroep); blijft behouden. */
  | { soort: "onbekend"; xml: string };

export interface SorteerSleutel {
  /** Kolom (0-gebaseerd, absoluut). */
  kolom: number;
  aflopend: boolean;
}

export interface BladFilter {
  /** Kopregel plus gegevens, zoals `ref` in het bestand. */
  bereik: Bereik;
  /** Per kolom ten opzichte van `bereik.left`. */
  kolommen: Map<number, KolomFilter>;
  sortering?: SorteerSleutel[];
}

/** Eén cel zoals de filter hem beoordeelt. */
export interface FilterCel {
  waarde: XlsxCellValue;
  tekst: string;
}

// ------------------------------------------------------------ beoordelen

const isLeeg = (c: FilterCel) =>
  c.waarde.kind === "empty" || (c.waarde.kind === "text" && c.waarde.value === "");

/** Getal uit invoer: "12,5", "1.234,5", "12.5", "15%", "1-2-2026" of "14:30". */
export function getalUit(tekst: string): number | null {
  const kaal = tekst.trim();
  if (!kaal) return null;
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(kaal)) return Number(kaal);
  const nl = leesNederlands(kaal);
  if (nl && /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(nl.invoer)) return Number(nl.invoer);
  return null;
}

/** Jokertekens zoals in Excel: * en ?, met ~ als ontsnapping. */
export function jokerPatroon(patroon: string) {
  let bron = "";
  for (let i = 0; i < patroon.length; i++) {
    const c = patroon[i];
    if (c === "~" && i + 1 < patroon.length) bron += patroon[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "*") bron += ".*";
    else if (c === "?") bron += ".";
    else bron += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${bron}$`, "is");
}

const ontsnapJoker = (t: string) => t.replace(/[~*?]/g, "~$&");

function vergelijk(cel: FilterCel, v: Voorwaarde): boolean {
  const tekst = cel.tekst;
  const leeg = isLeeg(cel);
  switch (v.operator) {
    case "begintMet":
      return !leeg && jokerPatroon(`${ontsnapJoker(v.waarde)}*`).test(tekst);
    case "eindigtOp":
      return !leeg && jokerPatroon(`*${ontsnapJoker(v.waarde)}`).test(tekst);
    case "bevat":
      return !leeg && jokerPatroon(`*${ontsnapJoker(v.waarde)}*`).test(tekst);
    case "bevatNiet":
      return leeg || !jokerPatroon(`*${ontsnapJoker(v.waarde)}*`).test(tekst);
  }
  const getal = getalUit(v.waarde);
  const celGetal = cel.waarde.kind === "number" ? cel.waarde.value : null;
  if (v.operator === "gelijk" || v.operator === "nietGelijk") {
    const gelijk =
      v.waarde === ""
        ? leeg
        : getal !== null && celGetal !== null
          ? Math.abs(celGetal - getal) < 1e-9
          : jokerPatroon(v.waarde).test(tekst);
    return v.operator === "gelijk" ? gelijk : !gelijk;
  }
  if (leeg) return false;
  let verschil: number;
  if (getal !== null && celGetal !== null) verschil = celGetal - getal;
  else if (getal !== null || celGetal !== null) return false;
  else verschil = tekst.localeCompare(v.waarde, undefined, { sensitivity: "base" });
  if (v.operator === "groter") return verschil > 0;
  if (v.operator === "groterGelijk") return verschil >= 0;
  if (v.operator === "kleiner") return verschil < 0;
  return verschil <= 0;
}

/** Drempel voor top/onderste N (items of procent) over de getallen van een kolom. */
export function topDrempel(cellen: FilterCel[], f: Extract<KolomFilter, { soort: "top" }>) {
  const getallen = cellen
    .map((c) => (c.waarde.kind === "number" ? c.waarde.value : null))
    .filter((g): g is number => g !== null)
    .sort((a, b) => (f.bovenste ? b - a : a - b));
  if (!getallen.length) return null;
  const n = f.procent
    ? Math.max(1, Math.floor((getallen.length * f.aantal) / 100))
    : Math.max(1, Math.floor(f.aantal));
  return getallen[Math.min(n, getallen.length) - 1];
}

/** Of een cel door het kolomfilter komt; `drempel` alleen voor top-filters. */
export function voldoet(cel: FilterCel, f: KolomFilter, drempel: number | null = null): boolean {
  if (f.soort === "onbekend") return true;
  if (f.soort === "waarden") {
    if (isLeeg(cel)) return f.leeg;
    const sleutel = cel.tekst.toLocaleLowerCase();
    return f.waarden.some((w) => w.toLocaleLowerCase() === sleutel);
  }
  if (f.soort === "top") {
    if (cel.waarde.kind !== "number" || drempel === null) return false;
    return f.bovenste ? cel.waarde.value >= drempel : cel.waarde.value <= drempel;
  }
  const actief = f.voorwaarden.filter((v) => v.operator === "gelijk" || v.operator === "nietGelijk" || v.waarde !== "");
  if (!actief.length) return true;
  const uitkomsten = actief.map((v) => vergelijk(cel, v));
  return f.en ? uitkomsten.every(Boolean) : uitkomsten.some(Boolean);
}

/**
 * Welke gegevensrijen zichtbaar zijn. `kolommen` geeft per kolom (relatief) de
 * cellen van de gegevensrijen. `nuVerborgen` bewaart rijen die een onbekend
 * filter uit het bestand verborg.
 */
export function zichtbareRijen(
  aantal: number,
  kolommen: Map<number, FilterCel[]>,
  filters: Map<number, KolomFilter>,
  nuVerborgen: (rij: number) => boolean = () => false,
): boolean[] {
  const zichtbaar = new Array<boolean>(aantal).fill(true);
  let onbekend = false;
  for (const [kolom, f] of filters) {
    if (f.soort === "onbekend") {
      onbekend = true;
      continue;
    }
    const cellen = kolommen.get(kolom) ?? [];
    const drempel = f.soort === "top" ? topDrempel(cellen, f) : null;
    for (let r = 0; r < aantal; r++)
      if (zichtbaar[r] && !voldoet(cellen[r] ?? { waarde: { kind: "empty" }, tekst: "" }, f, drempel))
        zichtbaar[r] = false;
  }
  if (onbekend) for (let r = 0; r < aantal; r++) if (nuVerborgen(r)) zichtbaar[r] = false;
  return zichtbaar;
}

/** Unieke weergaveteksten van een kolom, op waarde gesorteerd; lege cellen apart. */
export function waardenLijst(cellen: FilterCel[], taal?: string) {
  const per = new Map<string, FilterCel>();
  let leeg = false;
  for (const c of cellen) {
    if (isLeeg(c)) {
      leeg = true;
      continue;
    }
    const sleutel = c.tekst.toLocaleLowerCase();
    if (!per.has(sleutel)) per.set(sleutel, c);
  }
  const collator = new Intl.Collator(taal, { sensitivity: "base", numeric: true });
  const rang = (c: FilterCel) => (c.waarde.kind === "number" ? 0 : c.waarde.kind === "text" ? 1 : 2);
  const lijst = [...per.values()].sort((a, b) => {
    const r = rang(a) - rang(b);
    if (r) return r;
    if (a.waarde.kind === "number" && b.waarde.kind === "number") return a.waarde.value - b.waarde.value;
    return collator.compare(a.tekst, b.tekst);
  });
  return { waarden: lijst.map((c) => c.tekst), leeg, getallen: lijst.some((c) => c.waarde.kind === "number") };
}

export const heeftCriteria = (f: BladFilter | null | undefined) => !!f && f.kolommen.size > 0;

// ------------------------------------------------------------ de stand

interface Stand {
  bladen: Map<number, BladFilter>;
  /** Iets veranderd sinds openen: bij opslaan het element opnieuw schrijven. */
  aangeraakt: boolean;
  luisteraars: Set<() => void>;
}
const standen = new WeakMap<object, Stand>();

function stand(handle: object): Stand {
  let s = standen.get(handle);
  if (!s) standen.set(handle, (s = { bladen: new Map(), aangeraakt: false, luisteraars: new Set() }));
  return s;
}

const meld = (s: Stand) => s.luisteraars.forEach((l) => l());

export function bladFilter(handle: object, blad: number): BladFilter | null {
  return standen.get(handle)?.bladen.get(blad) ?? null;
}

export function zetBladFilter(handle: object, blad: number, filter: BladFilter | null) {
  const s = stand(handle);
  if (filter) s.bladen.set(blad, filter);
  else s.bladen.delete(blad);
  s.aangeraakt = true;
  meld(s);
}

/** Filters zoals bij openen gelezen; telt niet als wijziging. */
export function laadFilters(handle: object, filters: Map<number, BladFilter>) {
  const s = stand(handle);
  s.bladen = new Map(filters);
  s.aangeraakt = false;
  meld(s);
}

export function abonneerFilters(handle: object, luisteraar: () => void) {
  const s = stand(handle);
  s.luisteraars.add(luisteraar);
  return () => {
    s.luisteraars.delete(luisteraar);
  };
}

export const filtersAangeraakt = (handle: object) => standen.get(handle)?.aangeraakt ?? false;
export const alleFilters = (handle: object) => new Map(standen.get(handle)?.bladen ?? []);

type StructuurOp =
  | { type: "insertRows" | "deleteRows" | "insertCols" | "deleteCols"; sheet: number; at: number; count: number }
  | { type: "addSheet"; index: number }
  | { type: "removeSheet"; index: number }
  | { type: string };

/** Verschuift één as van een bereik na invoegen (n > 0) of verwijderen (n < 0) vanaf `at`. */
export function verschuifAs(van: number, tot: number, at: number, n: number): [number, number] | null {
  if (n > 0) {
    if (at <= van) return [van + n, tot + n];
    if (at <= tot) return [van, tot + n];
    return [van, tot];
  }
  const eindWeg = at - n - 1;
  const ervoor = Math.max(0, Math.min(eindWeg, van - 1) - at + 1);
  const erin = Math.max(0, Math.min(eindWeg, tot) - Math.max(at, van) + 1);
  const over = tot - van + 1 - erin;
  return over > 0 ? [van - ervoor, van - ervoor + over - 1] : null;
}

/** Houdt de filterbereiken bij na structurele bewerkingen via `applyOps`. */
export function filtersNaOps(handle: object, ops: readonly StructuurOp[]) {
  const s = standen.get(handle);
  if (!s || !s.bladen.size) return;
  let veranderd = false;
  for (const op of ops) {
    if (op.type === "addSheet" || op.type === "removeSheet") {
      const index = (op as { index: number }).index;
      const nieuw = new Map<number, BladFilter>();
      for (const [blad, f] of s.bladen) {
        if (op.type === "removeSheet" && blad === index) continue;
        nieuw.set(blad >= index ? blad + (op.type === "addSheet" ? 1 : -1) : blad, f);
      }
      s.bladen = nieuw;
      veranderd = true;
      continue;
    }
    if (!["insertRows", "deleteRows", "insertCols", "deleteCols"].includes(op.type)) continue;
    const { sheet, at, count } = op as { sheet: number; at: number; count: number };
    const f = s.bladen.get(sheet);
    if (!f) continue;
    const n = op.type.startsWith("insert") ? count : -count;
    const b = f.bereik;
    if (op.type.endsWith("Rows")) {
      const as = verschuifAs(b.top, b.bottom, at, n);
      if (!as) s.bladen.delete(sheet);
      else f.bereik = { ...b, top: as[0], bottom: as[1] };
    } else {
      const as = verschuifAs(b.left, b.right, at, n);
      if (!as) {
        s.bladen.delete(sheet);
      } else {
        // Kolomfilters schuiven mee; verwijderde kolommen vervallen.
        const kolommen = new Map<number, KolomFilter>();
        for (const [k, kf] of f.kolommen) {
          const abs = b.left + k;
          const nieuw = verschuifAs(abs, abs, at, n);
          if (nieuw) kolommen.set(nieuw[0] - as[0], kf);
        }
        f.bereik = { ...b, left: as[0], right: as[1] };
        f.kolommen = kolommen;
        f.sortering = f.sortering
          ?.map((k) => ({ ...k, kolom: verschuifAs(k.kolom, k.kolom, at, n)?.[0] ?? -1 }))
          .filter((k) => k.kolom >= 0);
      }
    }
    veranderd = true;
  }
  if (veranderd) {
    s.aangeraakt = true;
    meld(s);
  }
}

// ------------------------------------------------------------ XML

const XML_OPERATOR: Record<string, Operator> = {
  equal: "gelijk",
  notEqual: "nietGelijk",
  greaterThan: "groter",
  greaterThanOrEqual: "groterGelijk",
  lessThan: "kleiner",
  lessThanOrEqual: "kleinerGelijk",
};
const OPERATOR_XML: Partial<Record<Operator, string>> = Object.fromEntries(
  Object.entries(XML_OPERATOR).map(([x, o]) => [o, x]),
);

/** Een `customFilter` naar een voorwaarde; jokerpatronen worden tekstoperatoren. */
function leesVoorwaarde(el: XmlElement): Voorwaarde {
  const operator = XML_OPERATOR[attr(el, "operator") ?? "equal"] ?? "gelijk";
  const val = ontcijfer(attr(el, "val") ?? "");
  const tekst = /^(\*?)((?:[^*?~]|~[*?~])+)(\*?)$/.exec(val);
  if (tekst && (operator === "gelijk" || operator === "nietGelijk") && (tekst[1] || tekst[3])) {
    const kern = tekst[2].replace(/~([*?~])/g, "$1");
    if (operator === "nietGelijk") return tekst[1] && tekst[3] ? { operator: "bevatNiet", waarde: kern } : { operator, waarde: val };
    if (tekst[1] && tekst[3]) return { operator: "bevat", waarde: kern };
    return { operator: tekst[1] ? "eindigtOp" : "begintMet", waarde: kern };
  }
  return { operator, waarde: val };
}

function schrijfVoorwaarde(v: Voorwaarde) {
  const e = ontsnapJoker(v.waarde);
  const [operator, val] =
    v.operator === "begintMet"
      ? ["equal", `${e}*`]
      : v.operator === "eindigtOp"
        ? ["equal", `*${e}`]
        : v.operator === "bevat"
          ? ["equal", `*${e}*`]
          : v.operator === "bevatNiet"
            ? ["notEqual", `*${e}*`]
            : [OPERATOR_XML[v.operator] ?? "equal", v.waarde];
  const getal = getalUit(val);
  return `<customFilter${attrTekst({
    operator: operator === "equal" ? undefined : operator,
    val: getal !== null && v.operator !== "begintMet" && v.operator !== "eindigtOp" && v.operator !== "bevat" && v.operator !== "bevatNiet" ? String(getal) : val,
  })}/>`;
}

export function leesKolomFilter(xml: string, el: XmlElement): KolomFilter {
  const filters = kind(el, "filters");
  const custom = kind(el, "customFilters");
  const top = kind(el, "top10");
  const andere = elementen(el).filter((k) => !["filters", "customFilters", "top10", "extLst"].includes(k.lokaal));
  if (filters && !kinderen(filters, "dateGroupItem").length && !andere.length) {
    return {
      soort: "waarden",
      waarden: kinderen(filters, "filter").map((f) => ontcijfer(attr(f, "val") ?? "")),
      leeg: attr(filters, "blank") === "1" || attr(filters, "blank") === "true",
    };
  }
  if (custom && !andere.length)
    return {
      soort: "voorwaarden",
      en: attr(custom, "and") === "1" || attr(custom, "and") === "true",
      voorwaarden: kinderen(custom, "customFilter").map(leesVoorwaarde),
    };
  if (top && !andere.length)
    return {
      soort: "top",
      aantal: Number(attr(top, "val") ?? 10) || 10,
      bovenste: attr(top, "top") !== "0" && attr(top, "top") !== "false",
      procent: attr(top, "percent") === "1" || attr(top, "percent") === "true",
    };
  return { soort: "onbekend", xml: xml.slice(el.inhoudStart, el.inhoudEind) };
}

export function kolomFilterXml(kolom: number, f: KolomFilter) {
  let inhoud: string;
  if (f.soort === "onbekend") inhoud = f.xml;
  else if (f.soort === "waarden")
    inhoud = `<filters${f.leeg ? ' blank="1"' : ""}>${f.waarden.map((w) => `<filter val="${ontsnap(w)}"/>`).join("")}</filters>`;
  else if (f.soort === "top")
    inhoud = `<top10${attrTekst({ top: f.bovenste ? undefined : 0, percent: f.procent ? 1 : undefined, val: f.aantal })}/>`;
  else {
    const actief = f.voorwaarden.filter((v) => v.waarde !== "" || v.operator === "gelijk" || v.operator === "nietGelijk").slice(0, 2);
    inhoud = `<customFilters${f.en && actief.length > 1 ? ' and="1"' : ""}>${actief.map(schrijfVoorwaarde).join("")}</customFilters>`;
  }
  return `<filterColumn colId="${kolom}">${inhoud}</filterColumn>`;
}

export function autoFilterXml(f: BladFilter) {
  const kolommen = [...f.kolommen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, kf]) => kolomFilterXml(k, kf))
    .join("");
  const data = { ...f.bereik, top: f.bereik.top + 1 };
  const sortering =
    f.sortering?.length && data.top <= data.bottom
      ? `<sortState ref="${bereikA1(data)}">${f.sortering
          .map(
            (s) =>
              `<sortCondition${s.aflopend ? ' descending="1"' : ""} ref="${kolomLetters(s.kolom)}${data.top + 1}:${kolomLetters(s.kolom)}${data.bottom + 1}"/>`,
          )
          .join("")}</sortState>`
      : "";
  const ref = bereikA1(f.bereik);
  return kolommen || sortering ? `<autoFilter ref="${ref}">${kolommen}${sortering}</autoFilter>` : `<autoFilter ref="${ref}"/>`;
}

interface Blad {
  index: number;
  naam: string;
  pad: string;
}

function werkboek(pakket: Pakket) {
  const hoofd = pakket.relaties("").find((r) => r.type.endsWith("/officeDocument"));
  const pad = hoofd ? Pakket.doelPad("", hoofd.target) : "xl/workbook.xml";
  const xml = pakket.lees(pad);
  const wb = leesXml(xml);
  const bladen: Blad[] = kinderen(kind(wb, "sheets"), "sheet").map((s, index) => ({
    index,
    naam: ontcijfer(attr(s, "name") ?? `Sheet${index + 1}`),
    pad: pakket.doel(pad, rid(s) ?? "") ?? "",
  }));
  return { pad, xml, wb, bladen };
}

/** Filterbereiken uit `_xlnm._FilterDatabase`, per blad (die volgt invoegen in de engine wel). */
function filterNamen(wb: XmlElement, xml: string) {
  const uit = new Map<number, Bereik>();
  for (const n of kinderen(kind(wb, "definedNames"), "definedName")) {
    if (attr(n, "name") !== "_xlnm._FilterDatabase") continue;
    const blad = Number(attr(n, "localSheetId"));
    const formule = ontcijfer(xml.slice(n.inhoudStart, n.inhoudEind));
    const deel = formule.slice(formule.lastIndexOf("!") + 1).replace(/\$/g, "");
    const b = ontleedBereik(deel);
    if (Number.isInteger(blad) && b) uit.set(blad, b);
  }
  return uit;
}

/** Leest de autofilters van alle werkbladen. Onleesbare bestanden geven een lege lijst. */
export function leesAutoFilters(bytes: Uint8Array): Map<number, BladFilter> {
  const uit = new Map<number, BladFilter>();
  let pakket: Pakket;
  try {
    pakket = new Pakket(bytes);
  } catch {
    return uit;
  }
  const { wb, xml: wbXml, bladen } = werkboek(pakket);
  const namen = filterNamen(wb, wbXml);
  for (const blad of bladen) {
    if (!blad.pad || !pakket.heeft(blad.pad)) continue;
    const xml = pakket.lees(blad.pad);
    if (!xml.includes("autoFilter")) continue;
    const ws = leesXml(xml);
    const af = kind(ws, "autoFilter");
    const bereik = ontleedBereik(attr(af, "ref") ?? "") ?? null;
    if (!af || !bereik) continue;
    const kolommen = new Map<number, KolomFilter>();
    for (const fc of kinderen(af, "filterColumn")) {
      const id = Number(attr(fc, "colId"));
      if (Number.isInteger(id) && id >= 0) kolommen.set(id, leesKolomFilter(xml, fc));
    }
    const sortState = kind(af, "sortState");
    const sortering = kinderen(sortState, "sortCondition")
      .map((c) => {
        const b = ontleedBereik((attr(c, "ref") ?? "").replace(/\$/g, ""));
        return b ? { kolom: b.left, aflopend: attr(c, "descending") === "1" || attr(c, "descending") === "true" } : null;
      })
      .filter((s): s is SorteerSleutel => s !== null);
    // De gedefinieerde naam heeft voorrang: de engine schuift die mee bij invoegen.
    const naam = namen.get(blad.index);
    uit.set(blad.index, {
      bereik: naam && naam.left === bereik.left && naam.right === bereik.right ? naam : bereik,
      kolommen,
      ...(sortering.length ? { sortering } : {}),
    });
  }
  return uit;
}

// Volgorde in CT_Worksheet: autoFilter komt na deze elementen …
const VOOR_FILTER = ["sheetPr", "dimension", "sheetViews", "sheetFormatPr", "cols", "sheetData", "sheetCalcPr", "sheetProtection", "protectedRanges", "scenarios"];

function invoegpunt(ws: XmlElement) {
  const kids = elementen(ws);
  const laatsteVoor = [...kids].reverse().find((k) => VOOR_FILTER.includes(k.lokaal));
  if (laatsteVoor) return laatsteVoor.eind;
  return ws.inhoudStart;
}

const bladRef = (naam: string) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(naam) ? naam : `'${naam.replace(/'/g, "''")}'`);
const absoluut = (b: Bereik) =>
  `$${kolomLetters(b.left)}$${b.top + 1}:$${kolomLetters(b.right)}$${b.bottom + 1}`;

function schrijfBlad(xml: string, filter: BladFilter | null) {
  const ws = leesXml(xml);
  const v: Vervanging[] = [];
  const oud = kind(ws, "autoFilter");
  const nieuw = filter ? autoFilterXml(filter) : "";
  if (oud) v.push({ start: oud.start, eind: oud.eind, tekst: nieuw });
  else if (nieuw) {
    const p = invoegpunt(ws);
    v.push({ start: p, eind: p, tekst: nieuw });
  }
  // filterMode op sheetPr: aan zolang er criteria zijn.
  const actief = heeftCriteria(filter);
  const pr = kind(ws, "sheetPr");
  if (pr) {
    const attrs = { ...pr.attrs };
    if (actief) attrs.filterMode = "1";
    else delete attrs.filterMode;
    if (attrs.filterMode !== pr.attrs.filterMode) {
      const eindTag = eindBegintag(xml, pr);
      v.push({ start: pr.start, eind: eindTag, tekst: `<${pr.naam}${attrTekst(attrs)}` });
    }
  } else if (actief) {
    v.push({ start: ws.inhoudStart, eind: ws.inhoudStart, tekst: `<${ws.voorvoegsel ? ws.voorvoegsel + ":" : ""}sheetPr filterMode="1"/>` });
  }
  return vervang(xml, v);
}

function schrijfNamen(xml: string, bladen: Blad[], filters: Map<number, BladFilter | null>) {
  const wb = leesXml(xml);
  const dn = kind(wb, "definedNames");
  const behouden: string[] = [];
  for (const n of kinderen(dn, "definedName")) {
    const blad = Number(attr(n, "localSheetId"));
    if (attr(n, "name") === "_xlnm._FilterDatabase" && filters.has(blad)) continue;
    behouden.push(xml.slice(n.start, n.eind));
  }
  const nieuw: string[] = [];
  for (const [index, f] of filters) {
    const blad = bladen[index];
    if (!f || !blad) continue;
    nieuw.push(
      `<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">${ontsnap(`${bladRef(blad.naam)}!${absoluut(f.bereik)}`)}</definedName>`,
    );
  }
  const inhoud = [...nieuw, ...behouden].join("");
  const v: Vervanging[] = [];
  if (dn) v.push({ start: dn.start, eind: dn.eind, tekst: inhoud ? `<${dn.naam}${attrTekst(dn.attrs)}>${inhoud}</${dn.naam}>` : "" });
  else if (inhoud) {
    const na = ["externalReferences", "functionGroups", "sheets"].map((n) => kind(wb, n)).find((e) => e);
    const p = na ? na.eind : eindBegintag(xml, wb) + 1;
    v.push({ start: p, eind: p, tekst: `<definedNames>${inhoud}</definedNames>` });
  }
  return vervang(xml, v);
}

/**
 * Schrijft de filters (blad → filter, of null voor geen filter) in het pakket.
 * Bladen die niet in `filters` staan, blijven ongemoeid.
 */
export function schrijfAutoFilters(bytes: Uint8Array, filters: Map<number, BladFilter | null>): Uint8Array {
  if (!filters.size) return bytes;
  const pakket = new Pakket(bytes);
  const { pad, xml, bladen } = werkboek(pakket);
  for (const [index, f] of filters) {
    const blad = bladen[index];
    if (!blad?.pad || !pakket.heeft(blad.pad)) continue;
    const bron = pakket.lees(blad.pad);
    if (!/<(\w+:)?worksheet[\s>]/.test(bron)) continue;
    pakket.schrijf(blad.pad, schrijfBlad(bron, f));
  }
  pakket.schrijf(pad, schrijfNamen(xml, bladen, filters));
  return pakket.inpakken();
}

/** Werkboekbytes met de filterstand van deze sessie (ongewijzigd als er niets veranderde). */
export function metFilters(handle: object, bytes: Uint8Array, aantalBladen: number): Uint8Array {
  if (!filtersAangeraakt(handle)) return bytes;
  const huidige = alleFilters(handle);
  const alle = new Map<number, BladFilter | null>();
  for (let i = 0; i < aantalBladen; i++) alle.set(i, huidige.get(i) ?? null);
  return schrijfAutoFilters(bytes, alle);
}

/** `api.save()` plus de filterstand: zo bewaren opslaan, Opslaan als en herladen het autoFilter. */
export function werkboekBytes(api: { save(): Uint8Array; handle: object & { sheetInfo(): { sheetNames: string[] } } }) {
  const bytes = api.save();
  try {
    return metFilters(api.handle, bytes, api.handle.sheetInfo().sheetNames.length);
  } catch {
    // Liever opslaan zonder bijgewerkt filter dan niet opslaan.
    return bytes;
  }
}
