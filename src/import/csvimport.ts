/**
 * CSV/TSV importeren zonder runtime: codering, scheidingsteken en
 * tekstteken herkennen, cellen per kolom typeren (standaard, tekst, datum,
 * overslaan) en een XLSX maken. Tekst die met =, +, - of @ begint wordt
 * altijd als tekst opgenomen (nooit als formule) en krijgt een
 * apostrofvoorvoegsel, zodat bewerken er ook geen formule van maakt.
 */
import { strToU8, zipSync } from "fflate";
import i18next from "../i18n/config";
import {
  detecteerCodering,
  type Codering,
} from "../../packages/email/src/voorbeeld/codering";
import { xmlTekst } from "./docxschrijver";

export type CsvCodering =
  | "auto"
  | "utf-8"
  | "windows-1252"
  | "iso-8859-15"
  | "utf-16le"
  | "utf-16be";
export type Scheiding = ";" | "," | "\t" | "|" | string;
export type Kolomtype = "standaard" | "tekst" | "datum" | "overslaan";
export type Datumvolgorde = "DMJ" | "MDJ" | "JMD";

export interface CsvInstellingen {
  codering: CsvCodering;
  /** Eén teken; "auto" laat de app kiezen. */
  scheidingsteken: Scheiding | "auto";
  /** Tekstafbakening: meestal ", soms ' of geen. */
  tekstteken: '"' | "'" | "";
  kopregel: boolean;
  /** nl: 1.234,56; en: 1,234.56 */
  getalnotatie: "nl" | "en";
  datumvolgorde: Datumvolgorde;
  /** Per kolom; ontbrekende kolommen zijn "standaard". */
  kolomtypen: Kolomtype[];
  /** Rijen aan het begin overslaan (bijv. een titelregel van een export). */
  beginrij: number;
}

export const STANDAARD_INSTELLINGEN: CsvInstellingen = {
  codering: "auto",
  scheidingsteken: "auto",
  tekstteken: '"',
  kopregel: true,
  getalnotatie: "nl",
  datumvolgorde: "DMJ",
  kolomtypen: [],
  beginrij: 0,
};

export const CODERINGEN: { waarde: CsvCodering; naam: string }[] = [
  {
    waarde: "auto",
    get naam() {
      return i18next.t("spreadsheet:csvImport.encodingAuto");
    },
  },
  { waarde: "utf-8", naam: "UTF-8" },
  {
    waarde: "windows-1252",
    get naam() {
      return i18next.t("spreadsheet:csvImport.encodingWindows1252");
    },
  },
  { waarde: "iso-8859-15", naam: "ISO-8859-15 (Latin-9)" },
  { waarde: "utf-16le", naam: "UTF-16 LE" },
  { waarde: "utf-16be", naam: "UTF-16 BE" },
];

/** Decodeert met de gekozen of herkende codering. */
export function decodeerCsv(bytes: Uint8Array, codering: CsvCodering) {
  let gekozen: Exclude<CsvCodering, "auto">;
  let begin = 0;
  if (codering === "auto") {
    const herkend: Codering = detecteerCodering(
      bytes.subarray(0, 1 << 20),
      bytes.length > 1 << 20,
    );
    gekozen = herkend === "utf-8-bom" ? "utf-8" : herkend;
  } else gekozen = codering;
  if (
    gekozen === "utf-8" &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  )
    begin = 3;
  if (
    gekozen.startsWith("utf-16") &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) ||
      (bytes[0] === 0xfe && bytes[1] === 0xff))
  )
    begin = 2;
  const tekst = new TextDecoder(gekozen).decode(bytes.subarray(begin));
  return { tekst, codering: gekozen };
}

/** Splitst CSV-tekst in rijen en velden (RFC 4180, met instelbaar tekstteken). */
export function ontleedCsv(
  tekst: string,
  scheiding: string,
  tekstteken: string,
  maxRijen = Infinity,
): string[][] {
  const rijen: string[][] = [];
  let rij: string[] = [];
  let veld = "";
  let inAfbakening = false;
  let i = 0;
  const n = tekst.length;
  while (i < n) {
    const c = tekst[i];
    if (inAfbakening) {
      if (c === tekstteken) {
        if (tekst[i + 1] === tekstteken) {
          veld += c;
          i += 2;
          continue;
        }
        inAfbakening = false;
        i++;
        continue;
      }
      veld += c;
      i++;
      continue;
    }
    if (tekstteken && c === tekstteken && veld.trim() === "") {
      inAfbakening = true;
      veld = "";
      i++;
      continue;
    }
    if (c === scheiding) {
      rij.push(veld);
      veld = "";
      i++;
      continue;
    }
    if (c === "\r" || c === "\n") {
      rij.push(veld);
      veld = "";
      rijen.push(rij);
      rij = [];
      if (rijen.length >= maxRijen) return rijen;
      i += c === "\r" && tekst[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    veld += c;
    i++;
  }
  if (veld !== "" || rij.length) {
    rij.push(veld);
    rijen.push(rij);
  }
  return rijen;
}

/** Kiest het scheidingsteken dat in de eerste regels het meest consistent voorkomt. */
export function raadScheidingsteken(tekst: string, tekstteken = '"'): string {
  const voorbeeld = tekst.slice(0, 64 * 1024);
  let beste = ";";
  let besteScore = -1;
  for (const kandidaat of [";", ",", "\t", "|"]) {
    const rijen = ontleedCsv(voorbeeld, kandidaat, tekstteken, 30).filter(
      (r) => r.length > 1 || r[0] !== "",
    );
    if (!rijen.length) continue;
    const aantallen = rijen.map((r) => r.length);
    const meest = modus(aantallen);
    if (meest < 2) continue;
    const gelijk =
      aantallen.filter((a) => a === meest).length / aantallen.length;
    // Velden met een los tekstteken wijzen op een verkeerd scheidingsteken.
    const velden = rijen.flat();
    const los = tekstteken
      ? velden.filter((v) => v.includes(tekstteken)).length / velden.length
      : 0;
    const score = gelijk * 100 - los * 50 + Math.min(meest, 50);
    if (score > besteScore) {
      besteScore = score;
      beste = kandidaat;
    }
  }
  return beste;
}

function modus(getallen: number[]) {
  const telling = new Map<number, number>();
  for (const g of getallen) telling.set(g, (telling.get(g) ?? 0) + 1);
  return (
    [...telling.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ??
    0
  );
}

/** Raadt NL of EN getalnotatie uit getallen met zowel punt als komma. */
export function raadGetalnotatie(
  rijen: string[][],
  scheiding: string,
): "nl" | "en" {
  let nl = 0,
    en = 0;
  for (const rij of rijen.slice(0, 200))
    for (const v of rij) {
      const w = v.trim();
      if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(w) || /^-?\d+,\d{1,2}$/.test(w))
        nl++;
      else if (
        /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(w) ||
        /^-?\d+\.\d{1,2}$/.test(w)
      )
        en++;
    }
  if (nl === en) return scheiding === "," ? "en" : "nl";
  return nl > en ? "nl" : "en";
}

export type Cel =
  | { soort: "leeg" }
  | { soort: "getal"; waarde: number; procent?: boolean }
  | { soort: "datum"; waarde: number; tijd: boolean }
  | { soort: "tekst"; waarde: string; formuleachtig?: boolean };

/** Excel-serieel getal (systeem 1900) voor een datum en tijd. */
export function serieelGetal(
  jaar: number,
  maand: number,
  dag: number,
  uur = 0,
  minuut = 0,
  seconde = 0,
) {
  const ms = Date.UTC(jaar, maand - 1, dag, uur, minuut, seconde);
  const d = new Date(ms);
  if (
    d.getUTCFullYear() !== jaar ||
    d.getUTCMonth() !== maand - 1 ||
    d.getUTCDate() !== dag
  )
    return null;
  if (uur > 23 || minuut > 59 || seconde > 59) return null;
  const serieel = (ms - Date.UTC(1899, 11, 30)) / 86400000;
  // Vóór 1 maart 1900 telt Excel een niet-bestaande 29 februari mee; die datums weigeren we.
  return serieel < 61 ? null : serieel;
}

export function leesDatum(waarde: string, volgorde: Datumvolgorde) {
  const w = waarde.trim();
  const m =
    /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      w,
    );
  if (!m) return null;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let jaar: number, maand: number, dag: number;
  // Een viercijferig eerste deel is altijd jaar-maand-dag (ISO).
  if (m[1].length === 4) [jaar, maand, dag] = [a, b, c];
  else if (volgorde === "DMJ") [dag, maand, jaar] = [a, b, c];
  else if (volgorde === "MDJ") [maand, dag, jaar] = [a, b, c];
  else [jaar, maand, dag] = [a, b, c];
  // Tweecijferige jaren: 00–49 → 2000–2049, 50–99 → 1950–1999.
  if (jaar < 100) jaar += jaar < 50 ? 2000 : 1900;
  const tijd = m[4] !== undefined;
  const serieel = serieelGetal(
    jaar,
    maand,
    dag,
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
  );
  return serieel === null ? null : { waarde: serieel, tijd };
}

export function leesGetal(waarde: string, notatie: "nl" | "en") {
  let w = waarde.trim().replace(/[\u00a0\u202f]/g, " ");
  // Spaties alleen als duizendtalscheiding (1 234 567,89), niet in bijv. telefoonnummers.
  if (/^[-+]?\d{1,3}( \d{3})+([.,]\d+)?%?$/.test(w)) w = w.replace(/ /g, "");
  else if (w.includes(" ")) return null;
  let procent = false;
  if (w.endsWith("%")) {
    procent = true;
    w = w.slice(0, -1);
  }
  const [duizend, decimaal] = notatie === "nl" ? [".", ","] : [",", "."];
  const patroon =
    notatie === "nl"
      ? /^[-+]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/
      : /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
  // Ook wetenschappelijke notatie met de decimaalpunt/komma van de keuze.
  const wetenschappelijk = new RegExp(
    `^[-+]?\\d+(\\${decimaal}\\d+)?[eE][-+]?\\d+$`,
  );
  if (!patroon.test(w) && !wetenschappelijk.test(w)) return null;
  const genormaliseerd = w.split(duizend).join("").replace(decimaal, ".");
  const getal = Number(genormaliseerd);
  if (!Number.isFinite(getal)) return null;
  return { waarde: procent ? getal / 100 : getal, procent };
}

/** Moet deze waarde in een standaardkolom tekst blijven? (voorloopnul, lange code) */
function blijftTekst(waarde: string) {
  const w = waarde.trim();
  // Voorloopnullen (postcodes, telefoonnummers, artikelnummers): 0123, 06-…
  if (/^[-+]?0\d/.test(w)) return true;
  // Meer dan 15 cijfers past niet exact in een getal (IBAN, EAN, ordernummers).
  return w.replace(/\D/g, "").length > 15;
}

const FORMULEACHTIG = /^[=+\-@\t\r]/;

export function typeerCel(
  waarde: string,
  type: Kolomtype,
  instellingen: Pick<CsvInstellingen, "getalnotatie" | "datumvolgorde">,
): Cel {
  if (waarde === "") return { soort: "leeg" };
  if (type === "tekst")
    return {
      soort: "tekst",
      waarde,
      formuleachtig: FORMULEACHTIG.test(waarde),
    };
  if (type === "datum") {
    const datum = leesDatum(waarde, instellingen.datumvolgorde);
    return datum
      ? { soort: "datum", ...datum }
      : { soort: "tekst", waarde, formuleachtig: FORMULEACHTIG.test(waarde) };
  }
  const datum = leesDatum(waarde, instellingen.datumvolgorde);
  if (datum) return { soort: "datum", ...datum };
  if (!blijftTekst(waarde)) {
    const getal = leesGetal(waarde, instellingen.getalnotatie);
    if (getal) return { soort: "getal", ...getal };
  }
  return { soort: "tekst", waarde, formuleachtig: FORMULEACHTIG.test(waarde) };
}

export interface CsvVoorbereiding {
  tekst: string;
  codering: Exclude<CsvCodering, "auto">;
  scheidingsteken: string;
  rijen: string[][];
  kolommen: number;
}

/** Leest en splitst met de instellingen; "auto" wordt hier ingevuld. */
export function bereidCsvVoor(
  bytes: Uint8Array,
  instellingen: CsvInstellingen,
  maxRijen = Infinity,
): CsvVoorbereiding {
  const { tekst, codering } = decodeerCsv(bytes, instellingen.codering);
  const scheidingsteken =
    instellingen.scheidingsteken === "auto"
      ? raadScheidingsteken(tekst, instellingen.tekstteken)
      : instellingen.scheidingsteken || ";";
  const rijen = ontleedCsv(
    tekst,
    scheidingsteken,
    instellingen.tekstteken,
    maxRijen + instellingen.beginrij,
  ).slice(instellingen.beginrij);
  const kolommen = Math.max(0, ...rijen.slice(0, 1000).map((r) => r.length));
  return { tekst, codering, scheidingsteken, rijen, kolommen };
}

/** Eerste herkenning voor het venster: scheidingsteken, getalnotatie. */
export function herkenInstellingen(
  bytes: Uint8Array,
  ext: string,
): CsvInstellingen {
  const basis: CsvInstellingen = {
    ...STANDAARD_INSTELLINGEN,
    scheidingsteken: ext === "tsv" || ext === "tab" ? "\t" : "auto",
  };
  const voorbereid = bereidCsvVoor(bytes, basis, 200);
  return {
    ...basis,
    scheidingsteken: voorbereid.scheidingsteken,
    getalnotatie: raadGetalnotatie(
      voorbereid.rijen,
      voorbereid.scheidingsteken,
    ),
  };
}

export interface CsvResultaat {
  xlsx: Uint8Array;
  rijen: number;
  kolommen: number;
  formuleachtig: number;
  afgekapt: boolean;
  codering: string;
  scheidingsteken: string;
}

const MAX_RIJEN = 1_048_576;
const MAX_KOLOMMEN = 16_384;

function kolomletters(index: number) {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Zet de CSV met deze instellingen om naar een XLSX met één blad. */
export function csvNaarXlsx(
  bytes: Uint8Array,
  instellingen: CsvInstellingen,
  bladnaam = "Blad1",
): CsvResultaat {
  const voorbereid = bereidCsvVoor(bytes, instellingen);
  let rijen = voorbereid.rijen;
  // Lege slotregel(s) negeren.
  while (rijen.length && rijen.at(-1)!.every((v) => v === ""))
    rijen = rijen.slice(0, -1);
  const afgekapt =
    rijen.length > MAX_RIJEN || voorbereid.kolommen > MAX_KOLOMMEN;
  rijen = rijen.slice(0, MAX_RIJEN);
  const zichtbaar: number[] = [];
  const kolommen = Math.min(
    MAX_KOLOMMEN,
    Math.max(0, ...rijen.map((r) => r.length)),
  );
  for (let k = 0; k < kolommen; k++)
    if ((instellingen.kolomtypen[k] ?? "standaard") !== "overslaan")
      zichtbaar.push(k);

  const gedeeld = new Map<string, number>();
  const gedeeldeLijst: string[] = [];
  const tekstIndex = (s: string) => {
    let i = gedeeld.get(s);
    if (i === undefined) {
      i = gedeeldeLijst.length;
      gedeeld.set(s, i);
      gedeeldeLijst.push(s);
    }
    return i;
  };
  let formuleachtig = 0;
  const breedtes = zichtbaar.map(() => 8);
  const regels: string[] = [];
  rijen.forEach((rij, r) => {
    const kop = instellingen.kopregel && r === 0;
    const cellen: string[] = [];
    zichtbaar.forEach((k, uitKolom) => {
      const waarde = rij[k] ?? "";
      const ref = `${kolomletters(uitKolom)}${r + 1}`;
      const type = kop ? "tekst" : (instellingen.kolomtypen[k] ?? "standaard");
      const cel = typeerCel(waarde, type, instellingen);
      breedtes[uitKolom] = Math.min(
        60,
        Math.max(breedtes[uitKolom], waarde.length + 2),
      );
      switch (cel.soort) {
        case "leeg":
          return;
        case "getal":
          cellen.push(
            `<c r="${ref}"${cel.procent ? ' s="5"' : ""}><v>${cel.waarde}</v></c>`,
          );
          return;
        case "datum":
          cellen.push(
            `<c r="${ref}" s="${cel.tijd ? 4 : 1}"><v>${cel.waarde}</v></c>`,
          );
          return;
        case "tekst": {
          if (cel.formuleachtig) formuleachtig++;
          const stijl = kop
            ? 6
            : cel.formuleachtig
              ? 3
              : type === "tekst"
                ? 2
                : 0;
          cellen.push(
            `<c r="${ref}" t="s"${stijl ? ` s="${stijl}"` : ""}><v>${tekstIndex(cel.waarde)}</v></c>`,
          );
          return;
        }
      }
    });
    regels.push(`<row r="${r + 1}">${cellen.join("")}</row>`);
  });

  const tekstkolommen = zichtbaar.map(
    (k) => (instellingen.kolomtypen[k] ?? "standaard") === "tekst",
  );
  const cols = zichtbaar.length
    ? `<cols>${breedtes
        .map(
          (b, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${b}" customWidth="1"${tekstkolommen[i] ? ' style="2"' : ""}/>`,
        )
        .join("")}</cols>`
    : "";
  const bevriezen =
    instellingen.kopregel && rijen.length > 1
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const bereik =
    zichtbaar.length && rijen.length
      ? `A1:${kolomletters(zichtbaar.length - 1)}${rijen.length}`
      : "A1";
  const blad =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="${bereik}"/>${bevriezen}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${regels.join("")}</sheetData>` +
    (instellingen.kopregel && rijen.length > 1
      ? `<autoFilter ref="${bereik}"/>`
      : "") +
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  const datum =
    instellingen.datumvolgorde === "MDJ"
      ? "mm/dd/yyyy"
      : instellingen.datumvolgorde === "JMD"
        ? "yyyy-mm-dd"
        : "dd-mm-yyyy";
  const stijlen =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="${datum}"/><numFmt numFmtId="165" formatCode="${datum} hh:mm"/></numFmts>` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="7">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" quotePrefix="1"/>` +
    `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>` +
    `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const gedeeldXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${gedeeldeLijst.length}" uniqueCount="${gedeeldeLijst.length}">` +
    gedeeldeLijst
      .map(
        (s) =>
          `<si><t xml:space="preserve">${xmlTekst(s.replace(/\r\n?/g, "\n"))}</t></si>`,
      )
      .join("") +
    "</sst>";
  const veiligeNaam =
    bladnaam.replace(/[\\/?*[\]:]/g, "_").slice(0, 31) || "Blad1";
  const REL =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const xlsx = zipSync(
    {
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
          `</Types>`,
      ),
      "_rels/.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
      "xl/workbook.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}">` +
          `<bookViews><workbookView/></bookViews><sheets><sheet name="${xmlTekst(veiligeNaam)}" sheetId="1" r:id="rId1"/></sheets>` +
          (instellingen.kopregel && rijen.length > 1
            ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xmlTekst(veiligeNaam.replace(/'/g, "''"))}'!$A$1:$${kolomletters(Math.max(0, zichtbaar.length - 1))}$${rijen.length}</definedName></definedNames>`
            : "") +
          `</workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/>` +
          `<Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
      ),
      "xl/worksheets/sheet1.xml": strToU8(blad),
      "xl/styles.xml": strToU8(stijlen),
      "xl/sharedStrings.xml": strToU8(gedeeldXml),
    },
    { level: 6 },
  );
  return {
    xlsx,
    rijen: rijen.length,
    kolommen: zichtbaar.length,
    formuleachtig,
    afgekapt,
    codering: voorbereid.codering,
    scheidingsteken: voorbereid.scheidingsteken,
  };
}

/** Naam van het scheidingsteken in de interfacetaal, voor in een zin. */
export function scheidingsnaam(teken: string) {
  const sleutel =
    teken === "\t"
      ? "tab"
      : teken === ";"
        ? "semicolon"
        : teken === ","
          ? "comma"
          : teken === "|"
            ? "pipe"
            : "other";
  return i18next.t(`import:csv.separatorNames.${sleutel}`, { character: teken });
}
