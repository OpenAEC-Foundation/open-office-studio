/**
 * Herkenning van de voorbeeldsoort op extensie, opgegeven MIME-type en
 * magische bytes. De inhoud wint van de naam: een "foto.jpg" die een PDF is,
 * wordt als PDF getoond (met een waarschuwing over de misleidende naam).
 */
import i18next from "../../../../src/i18n/config";
import { formatGetal } from "../../../../src/i18n/opmaak";
import type { Kantoorsoort, Voorbeeldsoort } from "./contract";

export type Afbeeldingtype = "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg";

export interface Herkenning {
  soort: Voorbeeldsoort;
  extensie: string;
  /** Voor soort "afbeelding". */
  afbeelding?: Afbeeldingtype;
  /** Voor soort "office". */
  kantoor?: Kantoorsoort;
  /** Werd de soort aan de inhoud herkend (true) of alleen aan naam/type (false)? */
  opInhoud: boolean;
  /** Gezet als naam en inhoud elkaar tegenspreken. */
  waarschuwing?: string;
}

/** Aantal bytes dat de herkenning nodig heeft. */
export const KOPLENGTE = 4096;

export function extensieVan(naam: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(naam.trim());
  return m ? m[1].toLowerCase() : "";
}

const AFBEELDING_EXT: Record<string, Afbeeldingtype> = {
  jpg: "jpeg", jpeg: "jpeg", jpe: "jpeg", jfif: "jpeg",
  png: "png", gif: "gif", webp: "webp", bmp: "bmp", dib: "bmp", svg: "svg",
};
const TEKST_EXT = new Set([
  "txt", "text", "csv", "tsv", "log", "json", "xml", "ini", "cfg", "conf",
  "yml", "yaml", "toml", "eml", "vcf", "ics", "sql", "bat", "sh", "ps1",
]);
const MARKDOWN_EXT = new Set(["md", "markdown", "mdown", "mkd", "mkdn"]);
const KANTOOR_EXT: Record<string, Kantoorsoort> = {
  docx: "tekst", docm: "tekst", dotx: "tekst", odt: "tekst", ott: "tekst", doc: "tekst", rtf: "tekst",
  xlsx: "rekenblad", xlsm: "rekenblad", xltx: "rekenblad", ods: "rekenblad", ots: "rekenblad", xls: "rekenblad",
  pptx: "presentatie", pptm: "presentatie", potx: "presentatie", odp: "presentatie", otp: "presentatie", ppt: "presentatie",
  mdb: "database", accdb: "database",
};
export const MIME_AFBEELDING: Record<Afbeeldingtype, string> = {
  jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
};
/** Sleutel onder `email:preview.detection.kinds` per soort. */
const SOORTSLEUTEL: Record<Voorbeeldsoort, string> = {
  pdf: "pdf", dwg: "dwg", dxf: "dxf", ifc: "ifc", markdown: "markdown",
  tekst: "text", afbeelding: "image", office: "office", onbekend: "unknown",
};
const tk = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(`email:preview.detection.${sleutel}`, opties);

function begintMet(b: Uint8Array, s: string, vanaf = 0): boolean {
  if (b.length < vanaf + s.length) return false;
  for (let i = 0; i < s.length; i++) if (b[vanaf + i] !== s.charCodeAt(i)) return false;
  return true;
}
function begintMetBytes(b: Uint8Array, h: number[]): boolean {
  return b.length >= h.length && h.every((x, i) => b[i] === x);
}
/** Latin-1 weergave van de kop, voor zoeken naar ASCII-markeringen. */
export function latijn(b: Uint8Array, max = KOPLENGTE): string {
  const n = Math.min(b.length, max);
  let s = "";
  for (let i = 0; i < n; i += 8192) s += String.fromCharCode(...b.subarray(i, Math.min(n, i + 8192)));
  return s;
}

/** Herkent alleen aan de inhoud; `null` als de inhoud niets kenmerkends heeft. */
export function herkenInhoud(kop: Uint8Array): Omit<Herkenning, "extensie" | "opInhoud"> | "binair" | null {
  if (kop.length === 0) return null;
  // PDF mag volgens de norm binnen de eerste 1024 bytes beginnen.
  const tekst = latijn(kop, 1024);
  if (tekst.includes("%PDF-")) return { soort: "pdf" };
  if (/^AC10\d\d/.test(latijn(kop, 6))) return { soort: "dwg" };
  if (begintMet(kop, "AutoCAD Binary DXF")) return { soort: "dxf" };
  if (begintMetBytes(kop, [0xff, 0xd8, 0xff])) return { soort: "afbeelding", afbeelding: "jpeg" };
  if (begintMetBytes(kop, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { soort: "afbeelding", afbeelding: "png" };
  if (begintMet(kop, "GIF87a") || begintMet(kop, "GIF89a")) return { soort: "afbeelding", afbeelding: "gif" };
  if (begintMet(kop, "RIFF") && begintMet(kop, "WEBP", 8)) return { soort: "afbeelding", afbeelding: "webp" };
  if (begintMet(kop, "BM") && kop.length >= 26 && (kop[14] === 12 || kop[14] === 40 || kop[14] === 56 || kop[14] === 108 || kop[14] === 124))
    return { soort: "afbeelding", afbeelding: "bmp" };
  const ascii = latijn(kop);
  const zonderBom = ascii.replace(/^\xef\xbb\xbf/, "").trimStart();
  if (zonderBom.startsWith("ISO-10303-21;")) {
    if (/FILE_SCHEMA\s*\(\s*\(\s*'IFC/i.test(ascii)) return { soort: "ifc" };
    return "binair"; // STEP-bestand zonder IFC-schema (bijv. werktuigbouw-CAD)
  }
  if (begintMet(kop, "PK\x03\x04")) {
    const mime = /^PK\x03\x04[\s\S]{26}mimetype(application\/vnd\.oasis\.opendocument\.(text|spreadsheet|presentation))/.exec(ascii);
    if (mime) {
      const k: Kantoorsoort = mime[2] === "text" ? "tekst" : mime[2] === "spreadsheet" ? "rekenblad" : "presentatie";
      return { soort: "office", kantoor: k };
    }
    if (ascii.includes("[Content_Types].xml") || ascii.includes("_rels/.rels") || /(word|xl|ppt)\//.test(ascii)) {
      const k: Kantoorsoort | undefined = ascii.includes("word/") ? "tekst" : ascii.includes("xl/") ? "rekenblad" : ascii.includes("ppt/") ? "presentatie" : undefined;
      return { soort: "office", kantoor: k };
    }
    return "binair"; // gewone ZIP
  }
  if (begintMetBytes(kop, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { soort: "office" }; // OLE (doc/xls/ppt)
  if (begintMet(kop, "Standard Jet DB", 4) || begintMet(kop, "Standard ACE DB", 4)) return { soort: "office", kantoor: "database" };
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(zonderBom)) return { soort: "afbeelding", afbeelding: "svg" };
  // DXF (ASCII): begint met groepscode 0 en SECTION, eventueel na commentaar (999).
  if (/^\s*(999\r?\n[^\n]*\r?\n\s*)?0\r?\nSECTION\r?\n\s*2\r?\n(HEADER|CLASSES|TABLES|BLOCKS|ENTITIES)/.test(zonderBom)) return { soort: "dxf" };
  if (begintMet(kop, "MZ") || begintMet(kop, "\x7fELF")) return "binair";
  return null;
}

/** Lijkt de kop op tekst (geen NUL-bytes, tenzij UTF-16 met BOM)? */
export function lijktTekst(kop: Uint8Array): boolean {
  if (begintMetBytes(kop, [0xff, 0xfe]) || begintMetBytes(kop, [0xfe, 0xff])) return true;
  const n = Math.min(kop.length, KOPLENGTE);
  let stuur = 0;
  for (let i = 0; i < n; i++) {
    const c = kop[i];
    if (c === 0) return false;
    if (c < 9 || (c > 13 && c < 32 && c !== 27)) stuur++;
  }
  return n === 0 || stuur / n < 0.05;
}

function opNaam(ext: string, mime: string): Omit<Herkenning, "extensie" | "opInhoud"> {
  const m = mime.toLowerCase().split(";")[0].trim();
  if (ext === "pdf" || m === "application/pdf") return { soort: "pdf" };
  if (ext === "dwg" || m === "image/vnd.dwg" || m === "application/acad") return { soort: "dwg" };
  if (ext === "dxf" || m === "image/vnd.dxf") return { soort: "dxf" };
  if (ext === "ifc" || m === "application/x-ifc") return { soort: "ifc" };
  if (AFBEELDING_EXT[ext]) return { soort: "afbeelding", afbeelding: AFBEELDING_EXT[ext] };
  if (MARKDOWN_EXT.has(ext) || m === "text/markdown" || m === "text/x-markdown") return { soort: "markdown" };
  if (KANTOOR_EXT[ext]) return { soort: "office", kantoor: KANTOOR_EXT[ext] };
  if (TEKST_EXT.has(ext)) return { soort: "tekst" };
  if (m.startsWith("image/")) {
    const t = (Object.keys(MIME_AFBEELDING) as Afbeeldingtype[]).find((k) => MIME_AFBEELDING[k] === m);
    if (t) return { soort: "afbeelding", afbeelding: t };
  }
  if (m.startsWith("text/") || m === "application/json" || m === "application/xml") return { soort: "tekst" };
  return { soort: "onbekend" };
}

/**
 * Herkent de soort van een bijlage. `kop` zijn de eerste bytes (minstens
 * {@link KOPLENGTE} als beschikbaar); zonder kop wordt alleen op naam/type herkend.
 */
export function herkenSoort(bestandsnaam: string, inhoudstype: string, kop?: Uint8Array): Herkenning {
  const extensie = extensieVan(bestandsnaam);
  const naam = opNaam(extensie, inhoudstype);
  if (!kop) return { ...naam, extensie, opInhoud: false };
  const inhoud = herkenInhoud(kop);
  if (inhoud === "binair") {
    // Kenmerkende, maar niet te tonen inhoud: alleen Office mag op naam blijven
    // (bijv. een .xlsx die als ZIP zonder bekende ingang begint).
    if (naam.soort === "office" && begintMet(kop, "PK\x03\x04")) return { ...naam, extensie, opInhoud: false };
    const w = naam.soort !== "onbekend" ? tk("contentDiffers", { kind: soortnaam(naam.soort) }) : undefined;
    return { soort: "onbekend", extensie, opInhoud: true, waarschuwing: w };
  }
  if (inhoud) {
    const r: Herkenning = { ...inhoud, extensie, opInhoud: true };
    if (!r.kantoor && r.soort === "office" && naam.kantoor) r.kantoor = naam.kantoor;
    const zelfde = naam.soort === inhoud.soort && (inhoud.soort !== "afbeelding" || naam.afbeelding === inhoud.afbeelding);
    // CSV/TXT met SVG- of DXF-inhoud: als tekst tonen is veilig en verwacht.
    if (!zelfde && naam.soort === "tekst" && (inhoud.afbeelding === "svg" || inhoud.soort === "dxf"))
      return { ...naam, extensie, opInhoud: false };
    if (!zelfde && naam.soort !== "onbekend")
      r.waarschuwing = tk(inhoud.afbeelding ? "mismatchSubtype" : "mismatch", {
        extension: extensie || "?",
        named: soortnaam(naam.soort),
        actual: soortnaam(inhoud.soort),
        subtype: inhoud.afbeelding?.toUpperCase(),
      });
    return r;
  }
  // Geen kenmerkende inhoud.
  if (naam.soort === "tekst" || naam.soort === "markdown" || naam.soort === "dxf") {
    if (lijktTekst(kop)) return { ...naam, extensie, opInhoud: false };
    return { soort: "onbekend", extensie, opInhoud: true, waarschuwing: tk("contentBinary", { kind: soortnaam(naam.soort) }) };
  }
  if (naam.soort === "afbeelding" && naam.afbeelding === "svg") {
    return { soort: "onbekend", extensie, opInhoud: true, waarschuwing: tk("notSvg") };
  }
  if (naam.soort === "onbekend") {
    // Onbekende naam maar leesbare tekst: als tekst tonen.
    if (kop.length > 0 && lijktTekst(kop)) return { soort: "tekst", extensie, opInhoud: true };
    return { soort: "onbekend", extensie, opInhoud: false };
  }
  // Naam belooft PDF/DWG/IFC/afbeelding/Office, maar de handtekening ontbreekt.
  if (naam.soort === "office" && (naam.kantoor === "tekst" || naam.kantoor === "rekenblad") && /^(rtf|csv)$/.test(extensie))
    return { ...naam, extensie, opInhoud: false };
  return {
    soort: "onbekend",
    extensie,
    opInhoud: false,
    waarschuwing: tk("signatureMissing", { kind: soortnaam(naam.soort) }),
  };
}

/** Naam van de soort in de interfacetaal, zoals hij midden in een zin staat. */
export function soortnaam(s: Voorbeeldsoort): string {
  return tk(`kinds.${SOORTSLEUTEL[s]}`);
}

/** Grootte met binaire eenheden (1024) en het getalformaat van de interfacetaal. */
export function grootteTekst(bytes: number): string {
  const g = (n: number, cijfers: number) =>
    formatGetal(n, { minimumFractionDigits: cijfers, maximumFractionDigits: cijfers, useGrouping: false });
  if (bytes < 1024) return `${g(bytes, 0)} B`;
  if (bytes < 1024 * 1024) return `${g(Math.round(bytes / 1024), 0)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${g(bytes / 1024 / 1024, 1)} MB`;
  return `${g(bytes / 1024 / 1024 / 1024, 2)} GB`;
}
