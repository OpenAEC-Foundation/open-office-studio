/**
 * Pagina-indeling van rekenbladen lezen en schrijven in het XLSX-pakket:
 * pageSetup, printOptions, pageMargins, headerFooter, handmatige pagina-einden
 * en de gedefinieerde namen _xlnm.Print_Area en _xlnm.Print_Titles.
 *
 * Schrijven vervangt alleen de betrokken elementen; de rest van elk onderdeel
 * blijft byte-gelijk. Onbekende attributen (zoals de printerinstellingen via
 * r:id) blijven behouden.
 */
import { Pakket } from "../grafieken/pakket.ts";
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
  tekstVan,
  vervang,
  type Vervanging,
  type XmlElement,
} from "../grafieken/xml.ts";
import { PAPIER, papierUitXlsx, type Papier, type Stand } from "./model.ts";

/** Marges in inch, zoals SpreadsheetML ze opslaat. */
export interface Marges {
  links: number;
  rechts: number;
  boven: number;
  onder: number;
  kop: number;
  voet: number;
}

export interface KopVoet {
  links: string;
  midden: string;
  rechts: string;
}

export interface BladAfdrukInstellingen {
  papier: Papier;
  stand: Stand;
  marges: Marges;
  /** Percentage (10–400) als `passend` onwaar is. */
  schaal: number;
  passend: boolean;
  /** Aantal pagina's breed en hoog bij `passend`; 0 = automatisch. */
  passendBreed: number;
  passendHoog: number;
  rasterlijnen: boolean;
  koppen: boolean;
  horizontaalCentreren: boolean;
  verticaalCentreren: boolean;
  /** Eerst omlaag en dan over (standaard), of eerst over en dan omlaag. */
  volgorde: "omlaag" | "over";
  opmerkingen: "none" | "atEnd" | "asDisplayed";
  /** Afdrukbereik als A1-bereik, bijvoorbeeld "A1:H40"; null = gebruikt bereik. */
  afdrukbereik: string | null;
  /** Herhaalrijen als "1:2" en herhaalkolommen als "A:B". */
  herhaalRijen: string | null;
  herhaalKolommen: string | null;
  /** Kop- en voettekst met velden als &[Pagina], &[Pagina's], &[Datum], &[Tijd], &[Bestand], &[Blad]. */
  kop: KopVoet;
  voet: KopVoet;
  /** Handmatige pagina-einden: 0-gebaseerde eerste rij/kolom van een nieuwe pagina. */
  rijEinden: number[];
  kolomEinden: number[];
}

export const NORMALE_MARGES: Marges = {
  links: 0.7,
  rechts: 0.7,
  boven: 0.75,
  onder: 0.75,
  kop: 0.3,
  voet: 0.3,
};

export const standaardBladInstellingen = (): BladAfdrukInstellingen => ({
  papier: "A4",
  stand: "staand",
  marges: { ...NORMALE_MARGES },
  schaal: 100,
  passend: false,
  passendBreed: 1,
  passendHoog: 0,
  rasterlijnen: false,
  koppen: false,
  horizontaalCentreren: false,
  verticaalCentreren: false,
  volgorde: "omlaag",
  opmerkingen: "none",
  afdrukbereik: null,
  herhaalRijen: null,
  herhaalKolommen: null,
  kop: { links: "", midden: "", rechts: "" },
  voet: { links: "", midden: "", rechts: "" },
  rijEinden: [],
  kolomEinden: [],
});

// ---------------------------------------------------------------- velden

const VELDEN: [code: string, naam: string][] = [
  ["P", "Pagina"],
  ["N", "Pagina's"],
  ["D", "Datum"],
  ["T", "Tijd"],
  ["F", "Bestand"],
  ["A", "Blad"],
  ["Z", "Pad"],
];

/** Zet een SpreadsheetML-kop/voet (&L…&C…&R…) om naar drie leesbare delen. */
export function ontleedKopVoet(code: string | null | undefined): KopVoet {
  const uit: KopVoet = { links: "", midden: "", rechts: "" };
  if (!code) return uit;
  let deel: keyof KopVoet = "midden";
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c !== "&") {
      uit[deel] += c;
      i++;
      continue;
    }
    const volgende = code[i + 1] ?? "";
    if (volgende === "&") {
      uit[deel] += "&";
      i += 2;
    } else if (volgende === "L" || volgende === "C" || volgende === "R") {
      deel = volgende === "L" ? "links" : volgende === "C" ? "midden" : "rechts";
      i += 2;
    } else if (volgende === '"') {
      // Lettertype: &"Naam,Stijl"
      const eind = code.indexOf('"', i + 2);
      i = eind < 0 ? code.length : eind + 1;
    } else if (/\d/.test(volgende)) {
      // Lettergrootte: &12
      i += 1;
      while (i < code.length && /\d/.test(code[i])) i++;
    } else if (volgende === "K") {
      // Kleur: &KRRGGBB of &K<thema>
      i += 2;
      let n = 0;
      while (i < code.length && /[0-9A-Fa-f+-]/.test(code[i]) && n < 6) {
        i++;
        n++;
      }
    } else {
      const veld = VELDEN.find(([c]) => c === volgende.toUpperCase());
      if (veld) uit[deel] += `&[${veld[1]}]`;
      // Overige opmaakcodes (&B, &I, &U, &S, &X, &Y, &E, &O, &H, &G) vallen weg.
      i += 2;
    }
  }
  return uit;
}

function veldenNaarCode(tekst: string) {
  let uit = tekst.replace(/&(?!\[)/g, "&&");
  for (const [code, naam] of VELDEN)
    uit = uit.split(`&[${naam}]`).join(`&${code}`);
  return uit;
}

/** Zet drie leesbare delen terug naar SpreadsheetML-code; leeg geeft "". */
export function kopVoetCode(kv: KopVoet) {
  return (
    (kv.links ? `&L${veldenNaarCode(kv.links)}` : "") +
    (kv.midden ? `&C${veldenNaarCode(kv.midden)}` : "") +
    (kv.rechts ? `&R${veldenNaarCode(kv.rechts)}` : "")
  );
}

/** Vult de velden in voor één pagina. */
export function vulVelden(
  tekst: string,
  waarden: {
    pagina: number;
    paginas: number;
    datum: string;
    tijd: string;
    bestand: string;
    blad: string;
  },
) {
  return tekst
    .split("&[Pagina's]")
    .join(String(waarden.paginas))
    .split("&[Pagina]")
    .join(String(waarden.pagina))
    .split("&[Datum]")
    .join(waarden.datum)
    .split("&[Tijd]")
    .join(waarden.tijd)
    .split("&[Bestand]")
    .join(waarden.bestand)
    .split("&[Blad]")
    .join(waarden.blad)
    .split("&[Pad]")
    .join("");
}

// ---------------------------------------------------------------- adressen

export function kolomNaarIndex(letters: string) {
  let n = 0;
  for (const c of letters.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}
export function indexNaarKolom(index: number) {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface Bereik {
  rij1: number;
  kol1: number;
  rij2: number;
  kol2: number;
}

/** Ontleedt "A1:H40", "$A$1:$H$40" of "B3" (0-gebaseerd, inclusief). */
export function ontleedBereikA1(tekst: string): Bereik | null {
  const m =
    /^\s*\$?([A-Za-z]{1,3})\$?(\d{1,7})(?:\s*:\s*\$?([A-Za-z]{1,3})\$?(\d{1,7}))?\s*$/.exec(
      tekst,
    );
  if (!m) return null;
  const k1 = kolomNaarIndex(m[1]);
  const r1 = Number(m[2]) - 1;
  const k2 = m[3] ? kolomNaarIndex(m[3]) : k1;
  const r2 = m[4] ? Number(m[4]) - 1 : r1;
  if (r1 < 0 || r2 < 0) return null;
  return {
    rij1: Math.min(r1, r2),
    kol1: Math.min(k1, k2),
    rij2: Math.max(r1, r2),
    kol2: Math.max(k1, k2),
  };
}
export const bereikA1 = (b: Bereik) =>
  `${indexNaarKolom(b.kol1)}${b.rij1 + 1}:${indexNaarKolom(b.kol2)}${b.rij2 + 1}`;

/** "1:2" → [0, 1]; "3" → [2, 2]. */
export function ontleedRijen(tekst: string | null): [number, number] | null {
  const m = /^\s*\$?(\d{1,7})(?:\s*:\s*\$?(\d{1,7}))?\s*$/.exec(tekst ?? "");
  if (!m) return null;
  const a = Number(m[1]) - 1;
  const b = m[2] ? Number(m[2]) - 1 : a;
  if (a < 0 || b < 0) return null;
  return [Math.min(a, b), Math.max(a, b)];
}
/** "A:B" → [0, 1]. */
export function ontleedKolommen(tekst: string | null): [number, number] | null {
  const m = /^\s*\$?([A-Za-z]{1,3})(?:\s*:\s*\$?([A-Za-z]{1,3}))?\s*$/.exec(
    tekst ?? "",
  );
  if (!m) return null;
  const a = kolomNaarIndex(m[1]);
  const b = m[2] ? kolomNaarIndex(m[2]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

/** Bladnaam zoals in een formule: tussen enkele aanhalingstekens als dat nodig is. */
export function bladVerwijzing(naam: string) {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(naam) && !/^[A-Za-z]{1,3}\d+$/.test(naam)
    ? naam
    : `'${naam.replace(/'/g, "''")}'`;
}

/** Haalt de bladnaam weg uit een verwijzing zoals 'Blad 1'!$A$1:$B$2. */
function zonderBlad(deel: string) {
  const uitroep = deel.lastIndexOf("!");
  return (uitroep >= 0 ? deel.slice(uitroep + 1) : deel).trim();
}
function splitsGebieden(formule: string) {
  // Komma's binnen aanhalingstekens horen bij de bladnaam.
  const delen: string[] = [];
  let huidig = "";
  let inQuote = false;
  for (const c of formule) {
    if (c === "'") inQuote = !inQuote;
    if (c === "," && !inQuote) {
      delen.push(huidig);
      huidig = "";
    } else huidig += c;
  }
  if (huidig) delen.push(huidig);
  return delen;
}

// ---------------------------------------------------------------- pakket

interface BladInfo {
  index: number;
  naam: string;
  pad: string;
}

function bladen(pakket: Pakket): { werkboekPad: string; bladen: BladInfo[] } {
  const hoofd = pakket
    .relaties("")
    .find((r) => r.type.endsWith("/officeDocument"));
  const werkboekPad = hoofd ? Pakket.doelPad("", hoofd.target) : "xl/workbook.xml";
  const wb = leesXml(pakket.lees(werkboekPad));
  const lijst = kinderen(kind(wb, "sheets"), "sheet").map((s, index) => ({
    index,
    naam: ontcijfer(attr(s, "name") ?? `Blad${index + 1}`),
    pad: pakket.doel(werkboekPad, rid(s) ?? "") ?? "",
  }));
  return { werkboekPad, bladen: lijst };
}

const getal = (w: string | undefined, standaard: number) => {
  const n = Number(w);
  return w !== undefined && Number.isFinite(n) ? n : standaard;
};
const waar = (w: string | undefined) => w === "1" || w === "true";

/** Leest de afdrukinstellingen van alle bladen. */
export function leesAfdrukInstellingen(bytes: Uint8Array): BladAfdrukInstellingen[] {
  const pakket = new Pakket(bytes);
  const { werkboekPad, bladen: lijst } = bladen(pakket);
  const wb = leesXml(pakket.lees(werkboekPad));
  const namen = kinderen(kind(wb, "definedNames"), "definedName");
  return lijst.map((blad) => {
    const inst = standaardBladInstellingen();
    if (blad.pad && pakket.heeft(blad.pad)) {
      const ws = leesXml(pakket.lees(blad.pad));
      const marges = kind(ws, "pageMargins");
      if (marges)
        inst.marges = {
          links: getal(attr(marges, "left"), NORMALE_MARGES.links),
          rechts: getal(attr(marges, "right"), NORMALE_MARGES.rechts),
          boven: getal(attr(marges, "top"), NORMALE_MARGES.boven),
          onder: getal(attr(marges, "bottom"), NORMALE_MARGES.onder),
          kop: getal(attr(marges, "header"), NORMALE_MARGES.kop),
          voet: getal(attr(marges, "footer"), NORMALE_MARGES.voet),
        };
      const ps = kind(ws, "pageSetup");
      if (ps) {
        inst.papier = papierUitXlsx(getal(attr(ps, "paperSize"), 9));
        inst.stand = attr(ps, "orientation") === "landscape" ? "liggend" : "staand";
        inst.schaal = Math.min(400, Math.max(10, getal(attr(ps, "scale"), 100)));
        inst.passendBreed = getal(attr(ps, "fitToWidth"), 1);
        inst.passendHoog = getal(attr(ps, "fitToHeight"), 1);
        inst.volgorde = attr(ps, "pageOrder") === "overThenDown" ? "over" : "omlaag";
        const opmerkingen = attr(ps,"cellComments");
        inst.opmerkingen = opmerkingen === "atEnd" || opmerkingen === "asDisplayed" ? opmerkingen : "none";
      }
      const pr = kind(kind(ws, "sheetPr"), "pageSetUpPr");
      inst.passend = waar(attr(pr, "fitToPage"));
      const po = kind(ws, "printOptions");
      inst.rasterlijnen = waar(attr(po, "gridLines"));
      inst.koppen = waar(attr(po, "headings"));
      inst.horizontaalCentreren = waar(attr(po, "horizontalCentered"));
      inst.verticaalCentreren = waar(attr(po, "verticalCentered"));
      const hf = kind(ws, "headerFooter");
      inst.kop = ontleedKopVoet(tekstVan(kind(hf, "oddHeader")));
      inst.voet = ontleedKopVoet(tekstVan(kind(hf, "oddFooter")));
      inst.rijEinden = kinderen(kind(ws, "rowBreaks"), "brk")
        .map((b) => getal(attr(b, "id"), 0))
        .filter((n) => n > 0);
      inst.kolomEinden = kinderen(kind(ws, "colBreaks"), "brk")
        .map((b) => getal(attr(b, "id"), 0))
        .filter((n) => n > 0);
    }
    for (const naam of namen) {
      if (attr(naam, "localSheetId") !== String(blad.index)) continue;
      const formule = ontcijfer(tekstVan(naam));
      if (attr(naam, "name") === "_xlnm.Print_Area") {
        const eerste = splitsGebieden(formule)[0];
        const b = eerste ? ontleedBereikA1(zonderBlad(eerste)) : null;
        inst.afdrukbereik = b ? bereikA1(b) : null;
      } else if (attr(naam, "name") === "_xlnm.Print_Titles") {
        for (const deel of splitsGebieden(formule)) {
          const ref = zonderBlad(deel).replace(/\$/g, "");
          if (ontleedRijen(ref)) inst.herhaalRijen = ref;
          else if (ontleedKolommen(ref)) inst.herhaalKolommen = ref;
        }
      }
    }
    return inst;
  });
}

// Volgorde van CT_Worksheet na headerFooter: hier moet het blok ervóór.
const NA_KOPVOET = [
  "rowBreaks",
  "colBreaks",
  "customProperties",
  "cellWatches",
  "ignoredErrors",
  "smartTags",
  "drawing",
  "legacyDrawing",
  "legacyDrawingHF",
  "drawingHF",
  "picture",
  "oleObjects",
  "controls",
  "webPublishItems",
  "tableParts",
  "extLst",
];
// Elementen die vóór printOptions horen; het blok komt erna.
const VOOR_AFDRUK = [
  "sheetPr",
  "dimension",
  "sheetViews",
  "sheetFormatPr",
  "cols",
  "sheetData",
  "sheetCalcPr",
  "sheetProtection",
  "protectedRanges",
  "scenarios",
  "autoFilter",
  "sortState",
  "dataConsolidate",
  "customSheetViews",
  "mergeCells",
  "phoneticPr",
  "conditionalFormatting",
  "dataValidations",
  "hyperlinks",
];

function invoegpunt(ws: XmlElement, na: string[], voor: string[]) {
  const kids = elementen(ws);
  const eerstVolgend = kids.find((k) => na.includes(k.lokaal));
  if (eerstVolgend) return eerstVolgend.start;
  const laatsteVoor = [...kids].reverse().find((k) => voor.includes(k.lokaal));
  return laatsteVoor ? laatsteVoor.eind : ws.inhoudEind;
}

function attrsVan(el: XmlElement | null, weg: string[]) {
  const uit: Record<string, string> = {};
  if (!el) return uit;
  for (const [n, w] of Object.entries(el.attrs))
    if (!weg.includes(n.includes(":") ? n : n)) uit[n] = w;
  return uit;
}

function schrijfBlad(
  xml: string,
  inst: BladAfdrukInstellingen,
  oud: BladAfdrukInstellingen,
): string {
  const ws = leesXml(xml);
  const v: Vervanging[] = [];
  const weg = (lokaal: string) => {
    for (const el of kinderen(ws, lokaal)) v.push({ start: el.start, eind: el.eind, tekst: "" });
  };

  // sheetPr/pageSetUpPr fitToPage
  const sheetPr = kind(ws, "sheetPr");
  const fit = inst.passend ? "1" : "0";
  if (sheetPr) {
    const pr = kind(sheetPr, "pageSetUpPr");
    if (pr) {
      const attrs = { ...pr.attrs, fitToPage: fit };
      v.push({ start: pr.start, eind: pr.eind, tekst: `<${pr.naam}${attrTekst(attrs)}/>` });
    } else if (inst.passend) {
      const tag = `<${sheetPr.voorvoegsel ? sheetPr.voorvoegsel + ":" : ""}pageSetUpPr fitToPage="1"/>`;
      if (sheetPr.leeg)
        v.push({
          start: sheetPr.start,
          eind: sheetPr.eind,
          tekst: `<${sheetPr.naam}${attrTekst(sheetPr.attrs)}>${tag}</${sheetPr.naam}>`,
        });
      else v.push({ start: sheetPr.inhoudEind, eind: sheetPr.inhoudEind, tekst: tag });
    }
  } else if (inst.passend) {
    const eerste = elementen(ws)[0];
    const p = eerste ? eerste.start : ws.inhoudStart;
    v.push({ start: p, eind: p, tekst: `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` });
  }

  const po = kind(ws, "printOptions");
  const pm = kind(ws, "pageMargins");
  const ps = kind(ws, "pageSetup");
  const hf = kind(ws, "headerFooter");
  weg("printOptions");
  weg("pageMargins");
  weg("pageSetup");
  weg("headerFooter");

  const vlag = (b: boolean) => (b ? "1" : undefined);
  const poAttrs = {
    ...attrsVan(po, ["gridLines", "headings", "horizontalCentered", "verticalCentered"]),
    horizontalCentered: vlag(inst.horizontaalCentreren),
    verticalCentered: vlag(inst.verticaalCentreren),
    headings: vlag(inst.koppen),
    gridLines: vlag(inst.rasterlijnen),
  };
  let blok = "";
  if (Object.values(poAttrs).some((w) => w !== undefined))
    blok += `<printOptions${attrTekst(poAttrs)}/>`;
  const m = inst.marges;
  blok += `<pageMargins${attrTekst({ left: m.links, right: m.rechts, top: m.boven, bottom: m.onder, header: m.kop, footer: m.voet })}/>`;
  const psAttrs: Record<string, string | number | undefined> = {
    ...attrsVan(ps, ["paperSize", "scale", "fitToWidth", "fitToHeight", "orientation", "pageOrder", "cellComments"]),
  };
  const eigen = {
    paperSize: PAPIER[inst.papier].xlsx,
    scale: inst.passend ? undefined : Math.round(inst.schaal),
    fitToWidth: inst.passend ? inst.passendBreed : undefined,
    fitToHeight: inst.passend ? inst.passendHoog : undefined,
    pageOrder: inst.volgorde === "over" ? "overThenDown" : undefined,
    orientation: inst.stand === "liggend" ? "landscape" : "portrait",
    cellComments: inst.opmerkingen ?? "none",
  };
  // Vaste volgorde zoals Office: bekende attributen eerst, daarna de rest (zoals r:id).
  blok += `<pageSetup${attrTekst({ ...eigen, ...psAttrs })}/>`;
  const kopGewijzigd = JSON.stringify(inst.kop) !== JSON.stringify(oud.kop);
  const voetGewijzigd = JSON.stringify(inst.voet) !== JSON.stringify(oud.voet);
  if (hf && !kopGewijzigd && !voetGewijzigd) {
    blok += xml.slice(hf.start, hf.eind);
  } else {
    const kopCode = kopVoetCode(inst.kop);
    const voetCode = kopVoetCode(inst.voet);
    const overig = hf
      ? elementen(hf)
          .filter((k) => k.lokaal !== "oddHeader" && k.lokaal !== "oddFooter")
          .map((k) => xml.slice(k.start, k.eind))
          .join("")
      : "";
    const oudKop = kind(hf, "oddHeader");
    const oudVoet = kind(hf, "oddFooter");
    const kopXml = kopGewijzigd
      ? kopCode
        ? `<oddHeader>${ontsnap(kopCode)}</oddHeader>`
        : ""
      : oudKop
        ? xml.slice(oudKop.start, oudKop.eind)
        : "";
    const voetXml = voetGewijzigd
      ? voetCode
        ? `<oddFooter>${ontsnap(voetCode)}</oddFooter>`
        : ""
      : oudVoet
        ? xml.slice(oudVoet.start, oudVoet.eind)
        : "";
    if (kopXml || voetXml || overig)
      blok += `<headerFooter${attrTekst(hf?.attrs ?? {})}>${kopXml}${voetXml}${overig}</headerFooter>`;
  }
  // Handmatige pagina-einden: alleen herschrijven als ze zijn gewijzigd. Ze
  // volgen direct op headerFooter, dus ze gaan mee in hetzelfde blok.
  const eindenGewijzigd =
    inst.rijEinden.join() !== oud.rijEinden.join() ||
    inst.kolomEinden.join() !== oud.kolomEinden.join();
  if (eindenGewijzigd) {
    weg("rowBreaks");
    weg("colBreaks");
    const brk = (ids: number[], max: number) =>
      [...new Set(ids)]
        .sort((a, b) => a - b)
        .map((id) => `<brk${attrTekst({ id, max, man: 1 })}/>`)
        .join("");
    const r = new Set(inst.rijEinden).size;
    const k = new Set(inst.kolomEinden).size;
    if (r)
      blok += `<rowBreaks count="${r}" manualBreakCount="${r}">${brk(inst.rijEinden, 16383)}</rowBreaks>`;
    if (k)
      blok += `<colBreaks count="${k}" manualBreakCount="${k}">${brk(inst.kolomEinden, 1048575)}</colBreaks>`;
  }
  const p = invoegpunt(ws, NA_KOPVOET, VOOR_AFDRUK);
  v.push({ start: p, eind: p, tekst: blok });
  return vervang(xml, v);
}

function schrijfNamen(
  xml: string,
  lijst: BladInfo[],
  instellingen: BladAfdrukInstellingen[],
): string {
  const wb = leesXml(xml);
  const dn = kind(wb, "definedNames");
  const v: Vervanging[] = [];
  const beheerd = new Set(["_xlnm.Print_Area", "_xlnm.Print_Titles"]);
  const behouden: string[] = [];
  for (const naam of kinderen(dn, "definedName")) {
    const lokaal = Number(attr(naam, "localSheetId"));
    if (beheerd.has(attr(naam, "name") ?? "") && lijst.some((b) => b.index === lokaal)) continue;
    behouden.push(xml.slice(naam.start, naam.eind));
  }
  const nieuw: string[] = [];
  lijst.forEach((blad) => {
    const inst = instellingen[blad.index];
    if (!inst) return;
    const ref = bladVerwijzing(blad.naam);
    const b = inst.afdrukbereik ? ontleedBereikA1(inst.afdrukbereik) : null;
    if (b)
      nieuw.push(
        `<definedName name="_xlnm.Print_Area" localSheetId="${blad.index}">${ontsnap(
          `${ref}!$${indexNaarKolom(b.kol1)}$${b.rij1 + 1}:$${indexNaarKolom(b.kol2)}$${b.rij2 + 1}`,
        )}</definedName>`,
      );
    const delen: string[] = [];
    const rijen = ontleedRijen(inst.herhaalRijen);
    const kolommen = ontleedKolommen(inst.herhaalKolommen);
    if (kolommen)
      delen.push(`${ref}!$${indexNaarKolom(kolommen[0])}:$${indexNaarKolom(kolommen[1])}`);
    if (rijen) delen.push(`${ref}!$${rijen[0] + 1}:$${rijen[1] + 1}`);
    if (delen.length)
      nieuw.push(
        `<definedName name="_xlnm.Print_Titles" localSheetId="${blad.index}">${ontsnap(delen.join(","))}</definedName>`,
      );
  });
  // Ingebouwde namen vooraan, zoals Office ze schrijft.
  const inhoud = [...nieuw, ...behouden].join("");
  if (dn) {
    v.push({
      start: dn.start,
      eind: dn.eind,
      tekst: inhoud ? `<${dn.naam}${attrTekst(dn.attrs)}>${inhoud}</${dn.naam}>` : "",
    });
  } else if (inhoud) {
    const na = ["externalReferences", "functionGroups", "sheets"]
      .map((n) => kind(wb, n))
      .find((e) => e);
    const p = na ? na.eind : eindBegintag(xml, wb) + 1;
    v.push({ start: p, eind: p, tekst: `<definedNames>${inhoud}</definedNames>` });
  }
  return vervang(xml, v);
}

/**
 * Schrijft de afdrukinstellingen van de opgegeven bladen (index → instellingen)
 * in het pakket en geeft de nieuwe bytes terug.
 */
export function schrijfAfdrukInstellingen(
  bytes: Uint8Array,
  wijzigingen: Map<number, BladAfdrukInstellingen>,
): Uint8Array {
  const pakket = new Pakket(bytes);
  const oud = leesAfdrukInstellingen(bytes);
  const { werkboekPad, bladen: lijst } = bladen(pakket);
  const betrokken = lijst.filter((b) => wijzigingen.has(b.index));
  for (const blad of betrokken) {
    if (!blad.pad || !pakket.heeft(blad.pad)) continue;
    const xml = pakket.lees(blad.pad);
    if (!/<(\w+:)?worksheet[\s>]/.test(xml)) continue;
    pakket.schrijf(blad.pad, schrijfBlad(xml, wijzigingen.get(blad.index)!, oud[blad.index]));
  }
  const alle = lijst.map((b) => wijzigingen.get(b.index) ?? oud[b.index]);
  pakket.schrijf(werkboekPad, schrijfNamen(pakket.lees(werkboekPad), betrokken, alle));
  return pakket.inpakken();
}
