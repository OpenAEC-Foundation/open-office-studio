/**
 * Adreslijsten voor afdruk samenvoegen (#54): CSV/TSV, XLSX en ODS uit een
 * bestand, een geopend rekenblad of een tabel uit Database Studio. Alles komt
 * uit als één platte lijst: kolomnamen (uit de eerste rij) en tekstwaarden.
 * Puur en zonder engine, zodat het ook in vitest draait.
 */
import { unzipSync, strFromU8 } from "fflate";
import { decodeerCsv, ontleedCsv, raadScheidingsteken } from "../../import/csvimport";
import { attr, elementen, kind, kinderen, leesXml, tekstVan, zoekAlle, type XmlElement } from "../../grafieken/xml";

export interface Adreslijst {
  /** Naam voor de gebruiker: bestand, of bestand › blad/tabel. */
  naam: string;
  kolommen: string[];
  /** Eén rij per record, even lang als `kolommen`. */
  records: string[][];
}

/** Een blad of tabel waaruit de gebruiker kiest. */
export interface Tabel {
  naam: string;
  rijen: string[][];
}

/** Hoogstens zoveel records; grotere lijsten zijn voor samenvoegen niet zinvol in de browser. */
export const MAX_RECORDS = 20000;

/** Maakt een adreslijst van rijen: de eerste niet-lege rij geeft de kolomnamen. */
export function maakLijst(naam: string, rijen: readonly (readonly string[])[], kopregel = true): Adreslijst {
  const gevuld = rijen.filter((r) => r.some((c) => c.trim() !== ""));
  const breedte = Math.max(0, ...gevuld.map((r) => r.length));
  const kop = kopregel ? (gevuld[0] ?? []) : [];
  const gezien = new Map<string, number>();
  const kolommen = Array.from({ length: breedte }, (_, i) => {
    let n = (kop[i] ?? "").replace(/\s+/g, " ").trim() || `F${i + 1}`;
    const keer = gezien.get(n.toLowerCase()) ?? 0;
    gezien.set(n.toLowerCase(), keer + 1);
    if (keer) n = `${n}_${keer + 1}`;
    return n;
  });
  const records = gevuld
    .slice(kopregel ? 1 : 0, (kopregel ? 1 : 0) + MAX_RECORDS)
    .map((r) => Array.from({ length: breedte }, (_, i) => r[i] ?? ""));
  return { naam, kolommen, records };
}

// ---------------------------------------------------------------------------
// CSV

export function leesCsv(bytes: Uint8Array): string[][] {
  const { tekst } = decodeerCsv(bytes, "auto");
  const scheiding = raadScheidingsteken(tekst);
  return ontleedCsv(tekst, scheiding, '"', MAX_RECORDS + 1).map((r) => r.map((c) => c.replace(/\r/g, "")));
}

// ---------------------------------------------------------------------------
// XLSX

/** Kolomletters ("AB") naar een index vanaf 0. */
export function kolomIndex(letters: string) {
  let n = 0;
  for (const c of letters.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

const DATUMFORMATEN = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** Excel-serieel getal naar een datum (1900-systeem). */
export function serieelNaarDatum(n: number, tijd = false) {
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  const datum = `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
  return tijd && d.getUTCHours() + d.getUTCMinutes() > 0 ? `${datum} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : datum;
}

/** Een getal zoals het in een brief hoort: zonder drijvende-kommaruis. */
export function getalTekst(n: number) {
  if (!Number.isFinite(n)) return "";
  const r = Math.round(n * 1e10) / 1e10;
  return String(r);
}

function doelPad(basis: string, doel: string) {
  if (doel.startsWith("/")) return doel.slice(1);
  const delen = basis.split("/").slice(0, -1);
  for (const d of doel.split("/")) {
    if (d === "..") delen.pop();
    else if (d !== ".") delen.push(d);
  }
  return delen.join("/");
}

export function leesXlsx(bytes: Uint8Array): Tabel[] {
  const pakket = unzipSync(bytes);
  const lees = (pad: string) => (pakket[pad] ? strFromU8(pakket[pad]) : null);
  const werkboekXml = lees("xl/workbook.xml");
  if (!werkboekXml) throw new Error("xlsx");
  const relaties = new Map<string, string>();
  const relsXml = lees("xl/_rels/workbook.xml.rels");
  if (relsXml)
    for (const r of zoekAlle(leesXml(relsXml), "Relationship"))
      relaties.set(attr(r, "Id") ?? "", doelPad("xl/workbook.xml", attr(r, "Target") ?? ""));
  const gedeeld: string[] = [];
  const sst = lees("xl/sharedStrings.xml");
  if (sst) for (const si of kinderen(leesXml(sst), "si")) gedeeld.push(zoekAlle(si, "t").filter((t) => t.ouder?.lokaal !== "rPh").map(tekstVan).join(""));
  // Datumopmaak per stijlindex.
  const datumStijl: boolean[] = [];
  const stijlen = lees("xl/styles.xml");
  if (stijlen) {
    const wortel = leesXml(stijlen);
    const eigen = new Map<number, string>();
    for (const f of zoekAlle(wortel, "numFmt")) eigen.set(Number(attr(f, "numFmtId")), attr(f, "formatCode") ?? "");
    const xfs = kind(wortel, "cellXfs");
    for (const xf of kinderen(xfs, "xf")) {
      const id = Number(attr(xf, "numFmtId") ?? 0);
      const code = (eigen.get(id) ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, "");
      datumStijl.push(DATUMFORMATEN.has(id) || (/[dy]/i.test(code) && !/^[#0.,%]+$/.test(code)));
    }
  }
  const tabellen: Tabel[] = [];
  for (const blad of zoekAlle(leesXml(werkboekXml), "sheet")) {
    const rid = Object.entries(blad.attrs).find(([n]) => n.endsWith(":id"))?.[1] ?? "";
    const pad = relaties.get(rid);
    const xml = pad ? lees(pad) : null;
    if (!xml) continue;
    const rijen: string[][] = [];
    const data = kind(leesXml(xml), "sheetData");
    let volgendeRij = 0;
    for (const rij of kinderen(data, "row")) {
      const r = Number(attr(rij, "r") ?? volgendeRij + 1) - 1;
      volgendeRij = r + 1;
      if (r >= MAX_RECORDS + 1) break;
      const cellen: string[] = [];
      let volgende = 0;
      for (const c of kinderen(rij, "c")) {
        const ref = attr(c, "r");
        const kol = ref ? kolomIndex(ref.replace(/\d+$/, "")) : volgende;
        volgende = kol + 1;
        cellen[kol] = celWaarde(c, gedeeld, datumStijl);
      }
      rijen[r] = Array.from(cellen, (x) => x ?? "");
    }
    tabellen.push({ naam: attr(blad, "name") ?? `Blad${tabellen.length + 1}`, rijen: Array.from(rijen, (x) => x ?? []) });
  }
  return tabellen;
}

function celWaarde(c: XmlElement, gedeeld: string[], datumStijl: boolean[]) {
  const type = attr(c, "t");
  const v = tekstVan(kind(c, "v"));
  if (type === "s") return gedeeld[Number(v)] ?? "";
  if (type === "inlineStr") return zoekAlle(c, "t").map(tekstVan).join("");
  if (type === "str" || type === "e") return v;
  if (type === "b") return v === "1" ? "WAAR" : "ONWAAR";
  if (v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return datumStijl[Number(attr(c, "s") ?? 0)] ? serieelNaarDatum(n, n % 1 !== 0) : getalTekst(n);
}

// ---------------------------------------------------------------------------
// ODS

export function leesOds(bytes: Uint8Array): Tabel[] {
  const pakket = unzipSync(bytes, { filter: (f) => f.name === "content.xml" });
  const inhoud = pakket["content.xml"];
  if (!inhoud) throw new Error("ods");
  const tabellen: Tabel[] = [];
  for (const tabel of zoekAlle(leesXml(strFromU8(inhoud)), "table")) {
    if (tabel.voorvoegsel !== "table") continue;
    const rijen: string[][] = [];
    for (const rij of zoekAlle(tabel, "table-row")) {
      const herhaal = Math.min(Number(attr(rij, "number-rows-repeated") ?? 1), 1000);
      const cellen: string[] = [];
      for (const cel of elementen(rij)) {
        if (cel.lokaal !== "table-cell" && cel.lokaal !== "covered-table-cell") continue;
        const keer = Math.min(Number(attr(cel, "number-columns-repeated") ?? 1), 1000);
        const waarde = odsWaarde(cel);
        for (let i = 0; i < keer; i++) cellen.push(waarde);
      }
      while (cellen.length && cellen[cellen.length - 1] === "") cellen.pop();
      for (let i = 0; i < herhaal; i++) rijen.push(cellen);
      if (rijen.length > MAX_RECORDS + 1) break;
    }
    while (rijen.length && !rijen[rijen.length - 1].length) rijen.pop();
    tabellen.push({ naam: attr(tabel, "name") ?? `Blad${tabellen.length + 1}`, rijen });
  }
  return tabellen;
}

function odsWaarde(cel: XmlElement) {
  const soort = attr(cel, "value-type");
  if (soort === "float" || soort === "percentage" || soort === "currency") {
    const n = Number(attr(cel, "value"));
    if (Number.isFinite(n) && !kinderen(cel, "p").length) return getalTekst(n);
  }
  if (soort === "date") {
    const d = attr(cel, "date-value") ?? "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return kinderen(cel, "p")
    .map((p) => odsTekst(p))
    .join("\n");
}

function odsTekst(el: XmlElement): string {
  let uit = "";
  for (const k of el.kinderen) {
    if (k.soort === "tekst") uit += k.tekst;
    else if (k.lokaal === "s") uit += " ".repeat(Number(attr(k, "c") ?? 1));
    else if (k.lokaal === "tab") uit += "\t";
    else if (k.lokaal === "line-break") uit += "\n";
    else if (k.lokaal !== "annotation") uit += odsTekst(k);
  }
  return uit;
}

// ---------------------------------------------------------------------------

export type Bestandssoort = "csv" | "xlsx" | "ods";

export function soortVan(naam: string): Bestandssoort | null {
  const ext = naam.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "tsv" || ext === "txt") return "csv";
  if (ext === "xlsx" || ext === "xlsm") return "xlsx";
  if (ext === "ods") return "ods";
  return null;
}

/** De tabellen in een bestand (CSV heeft er één). */
export function tabellenUitBestand(naam: string, bytes: Uint8Array): Tabel[] {
  const soort = soortVan(naam);
  if (soort === "csv") return [{ naam, rijen: leesCsv(bytes) }];
  if (soort === "xlsx") return leesXlsx(bytes);
  if (soort === "ods") return leesOds(bytes);
  throw new Error("soort");
}
