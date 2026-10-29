/**
 * Metadata uit DWG- en DXF-bestanden zonder renderer. Het echte voorbeeld
 * (tekening) komt later via de Rust-viewer; dit levert de kaart.
 */
import i18next from "../../../../src/i18n/config";
import { formatLijst } from "../../../../src/i18n/opmaak";
import { decodeerTekst } from "./codering";

export interface DwgVersie {
  code: string;
  release: string;
  /** AutoCAD-versies die dit formaat schrijven (in de interfacetaal van dat moment). */
  autocad: string;
}

/**
 * AutoCAD-versies per DWG-formaat: een opsomming (wordt "a, b en c" in de
 * interfacetaal), een reeks `{ van, tot }` of `{ vanaf }` ("… en later").
 */
export type AutocadVersies = string[] | { van: string; tot: string } | { vanaf: string };

export const DWG_VERSIES: Record<string, { release: string; autocad: AutocadVersies }> = {
  AC1001: { release: "R2.2", autocad: ["AutoCAD 2.2"] },
  AC1002: { release: "R2.5", autocad: ["AutoCAD 2.5"] },
  AC1003: { release: "R2.6", autocad: ["AutoCAD 2.6"] },
  AC1004: { release: "R9", autocad: ["AutoCAD Release 9"] },
  AC1006: { release: "R10", autocad: ["AutoCAD Release 10"] },
  AC1009: { release: "R11/R12", autocad: ["AutoCAD Release 11", "12"] },
  AC1012: { release: "R13", autocad: ["AutoCAD Release 13"] },
  AC1014: { release: "R14", autocad: ["AutoCAD Release 14"] },
  AC1015: { release: "R2000", autocad: ["AutoCAD 2000", "2000i", "2002"] },
  AC1018: { release: "R2004", autocad: ["AutoCAD 2004", "2005", "2006"] },
  AC1021: { release: "R2007", autocad: ["AutoCAD 2007", "2008", "2009"] },
  AC1024: { release: "R2010", autocad: ["AutoCAD 2010", "2011", "2012"] },
  AC1027: { release: "R2013", autocad: { van: "2013", tot: "2017" } },
  AC1032: { release: "R2018", autocad: { vanaf: "2018" } },
};

/** AutoCAD-versies bij een DWG-code als tekst in de interfacetaal; undefined als onbekend. */
export function autocadNaam(code: string): string | undefined {
  const v = DWG_VERSIES[code]?.autocad;
  if (!v) return undefined;
  if (Array.isArray(v)) return formatLijst(v);
  if ("vanaf" in v) return i18next.t("email:preview.cad.versionAndLater", { version: v.vanaf });
  return i18next.t("email:preview.cad.versionRange", { from: v.van, to: v.tot });
}

export function dwgVersie(code: string): DwgVersie | null {
  const v = DWG_VERSIES[code];
  return v ? { code, release: v.release, autocad: autocadNaam(code)! } : null;
}

export interface DwgMeta {
  /** Bijv. "AC1032"; null als de kop niet klopt. */
  code: string | null;
  versie: DwgVersie | null;
  /** Ingebed miniatuurvoorbeeld (BMP of PNG), indien gevonden. */
  miniatuur?: { type: "image/png" | "image/bmp"; bytes: Uint8Array };
}

function u32(b: Uint8Array, p: number) {
  return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) + b[p + 3] * 0x1000000;
}

/** Leest de DWG-kop en, waar mogelijk, het ingebedde miniatuurvoorbeeld. */
export function leesDwgMeta(b: Uint8Array): DwgMeta {
  const kop = String.fromCharCode(...b.subarray(0, 6));
  if (!/^AC\d{4}$/.test(kop)) return { code: null, versie: null };
  const meta: DwgMeta = { code: kop, versie: dwgVersie(kop) };
  try {
    meta.miniatuur = leesMiniatuur(b, kop);
  } catch {
    // Geen of onleesbaar miniatuur: geen probleem.
  }
  return meta;
}

/**
 * Vanaf R13 staat op 0x0D het adres van de "image data"-sectie: 16 bytes
 * sentinel, 4 bytes totaalgrootte, 1 byte aantal, dan per ingang
 * code (1=kop, 2=BMP, 3=WMF, 6=PNG), begin (4) en grootte (4).
 */
function leesMiniatuur(b: Uint8Array, code: string): DwgMeta["miniatuur"] {
  if (code < "AC1012" || b.length < 0x11) return undefined;
  const adres = u32(b, 0x0d);
  if (adres < 0x14 || adres + 21 > b.length) return undefined;
  let p = adres + 16 + 4;
  const aantal = b[p++];
  if (aantal < 1 || aantal > 8) return undefined;
  for (let i = 0; i < aantal; i++, p += 9) {
    if (p + 9 > b.length) return undefined;
    const soort = b[p];
    const begin = u32(b, p + 1);
    const grootte = u32(b, p + 5);
    if (grootte < 16 || begin + grootte > b.length) continue;
    const data = b.subarray(begin, begin + grootte);
    if (soort === 6 && data[0] === 0x89 && data[1] === 0x50) return { type: "image/png", bytes: data.slice() };
    if (soort === 2) {
      const bmp = dibNaarBmp(data);
      if (bmp) return { type: "image/bmp", bytes: bmp };
    }
  }
  return undefined;
}

/** Zet een DIB (zonder bestandskop) om in een BMP-bestand. */
export function dibNaarBmp(dib: Uint8Array): Uint8Array | null {
  const kopGrootte = u32(dib, 0);
  if (kopGrootte !== 40 && kopGrootte !== 108 && kopGrootte !== 124) return null;
  const bits = dib[14] | (dib[15] << 8);
  let kleuren = u32(dib, 32);
  if (!kleuren && bits <= 8) kleuren = 1 << bits;
  const pixelStart = 14 + kopGrootte + kleuren * 4;
  const uit = new Uint8Array(14 + dib.length);
  const dv = new DataView(uit.buffer);
  uit[0] = 0x42; // B
  uit[1] = 0x4d; // M
  dv.setUint32(2, uit.length, true);
  dv.setUint32(10, pixelStart, true);
  uit.set(dib, 14);
  return uit;
}

/** $INSUNITS-code → sleutel onder `email:preview.cad.unitNames`. */
export const INSUNITS: Record<number, string> = {
  0: "unitless", 1: "inch", 2: "foot", 3: "mile", 4: "millimeter", 5: "centimeter",
  6: "meter", 7: "kilometer", 8: "microinch", 9: "mil", 10: "yard", 11: "angstrom",
  12: "nanometer", 13: "micron", 14: "decimeter", 15: "decameter", 16: "hectometer",
  17: "gigameter", 18: "astronomicalUnit", 19: "lightYear", 20: "parsec",
  21: "usSurveyFoot", 22: "usSurveyInch", 23: "usSurveyYard", 24: "usSurveyMile",
};

/** Naam van een $INSUNITS-eenheid in de interfacetaal. */
export function eenheidNaam(insunits: number): string {
  const sleutel = INSUNITS[insunits];
  return sleutel
    ? i18next.t(`email:preview.cad.unitNames.${sleutel}`)
    : i18next.t("email:preview.cad.unitCode", { code: insunits });
}

export interface DxfMeta {
  binair: boolean;
  acadver?: string;
  versie?: DwgVersie | null;
  insunits?: number;
  eenheid?: string;
  /** Aantal entiteiten per type uit de ENTITIES-sectie, aflopend. */
  entiteiten: [string, number][];
  totaalEntiteiten: number;
  lagen: string[];
  blokken: number;
}

/** Ontleedt een ASCII-DXF (paren van groepscode en waarde, elk op een eigen regel). */
export function leesDxfMeta(b: Uint8Array): DxfMeta {
  const leeg: DxfMeta = { binair: false, entiteiten: [], totaalEntiteiten: 0, lagen: [], blokken: 0 };
  if (String.fromCharCode(...b.subarray(0, 18)) === "AutoCAD Binary DXF") return { ...leeg, binair: true };
  const { tekst } = decodeerTekst(b);
  const meta = leeg;
  const telling = new Map<string, number>();
  const lagen = new Set<string>();
  let sectie = "";
  let tabel = "";
  let vorigeVar = "";
  let entiteit = ""; // huidig object (0-waarde)
  let verwachtSectienaam = false;
  let p = 0;
  const n = tekst.length;
  const regel = () => {
    if (p >= n) return null;
    let e = tekst.indexOf("\n", p);
    if (e < 0) e = n;
    const r = tekst.slice(p, e).replace(/\r$/, "");
    p = e + 1;
    return r;
  };
  for (;;) {
    const c = regel();
    if (c === null) break;
    const v = regel();
    if (v === null) break;
    const code = parseInt(c.trim(), 10);
    if (isNaN(code)) continue;
    const waarde = v.trim();
    if (code === 0) {
      entiteit = waarde;
      if (waarde === "SECTION") verwachtSectienaam = true;
      else if (waarde === "ENDSEC") { sectie = ""; tabel = ""; }
      else if (waarde === "ENDTAB") tabel = "";
      else if (sectie === "ENTITIES" && waarde !== "SEQEND") telling.set(waarde, (telling.get(waarde) ?? 0) + 1);
      else if (sectie === "BLOCKS" && waarde === "BLOCK") meta.blokken++;
      continue;
    }
    if (code === 2 && verwachtSectienaam) {
      sectie = waarde;
      verwachtSectienaam = false;
      continue;
    }
    if (sectie === "HEADER") {
      if (code === 9) vorigeVar = waarde;
      else if (vorigeVar === "$ACADVER" && code === 1) meta.acadver = waarde;
      else if (vorigeVar === "$INSUNITS" && code === 70) meta.insunits = parseInt(waarde, 10);
    } else if (sectie === "TABLES") {
      if (entiteit === "TABLE" && code === 2) tabel = waarde;
      else if (tabel === "LAYER" && entiteit === "LAYER" && code === 2) lagen.add(waarde);
    }
  }
  if (meta.acadver) meta.versie = dwgVersie(meta.acadver);
  if (meta.insunits !== undefined) meta.eenheid = eenheidNaam(meta.insunits);
  meta.entiteiten = [...telling].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  meta.totaalEntiteiten = [...telling.values()].reduce((a, b) => a + b, 0);
  meta.lagen = [...lagen].sort((a, b) => a.localeCompare(b, "nl"));
  return meta;
}
