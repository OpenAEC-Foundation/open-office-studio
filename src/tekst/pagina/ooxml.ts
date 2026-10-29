/**
 * Gedeelde OOXML-hulp voor de paginafuncties van Tekst (pakketroute):
 * het hoofddocument openen, kinderen in schemavolgorde zetten, secties
 * vinden, stijlen en onderdelen toevoegen en een markering bij de cursor
 * vervangen. Alles is puur: tekst erin, tekst eruit. Ongewijzigde stukken
 * blijven byte-gelijk (zie `src/grafieken/xml.ts`).
 */
import { Pakket, REL } from "../../grafieken/pakket.ts";
import { GrafiekFout } from "../../grafieken/fouten.ts";
import { paginaTekst } from "./tekst.ts";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  tekstVan,
  vervang,
  voorvoegselVoor,
  zoekAlle,
  type Vervanging,
  type XmlElement,
} from "../../grafieken/xml.ts";

export { Pakket, attr, attrTekst, elementen, kind, kinderen, leesXml, ontsnap, tekstVan, vervang, zoekAlle };
export type { Vervanging, XmlElement };

/** Een melding voor de gebruiker; geen programmeerfout. */
export class PaginaFout extends Error {
  constructor(bericht: string) {
    super(bericht);
    this.name = "PaginaFout";
  }
}

export const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const W_NS_ATTR = `xmlns:w="${NS_W}" xmlns:r="${NS_R}"`;

export const WREL = {
  header: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
  footer: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
  footnotes: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes",
  endnotes: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes",
  settings: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings",
  styles: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
};
export const WTYPE = {
  header: "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",
  footer: "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
  footnotes: "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml",
  endnotes: "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml",
  settings: "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml",
  styles: "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
};

/** Zet fouten van de gedeelde pakketlaag om in een paginamelding. */
export function metPakket<T>(bytes: Uint8Array, werk: (pakket: Pakket) => T): T {
  let pakket: Pakket;
  try {
    pakket = new Pakket(bytes);
  } catch (e) {
    if (e instanceof GrafiekFout)
      throw new PaginaFout(e.message.replace("om er een grafiek in te bewerken", "om te bewerken"));
    throw e;
  }
  try {
    return werk(pakket);
  } catch (e) {
    if (e instanceof GrafiekFout) throw new PaginaFout(e.message);
    throw e;
  }
}

/** Pad van het hoofddocument (meestal `word/document.xml`). */
export function documentPad(pakket: Pakket) {
  const rel = pakket.relaties("").find((r) => r.type === REL.officeDocument);
  if (!rel) throw new PaginaFout(paginaTekst("errors.missingMainPart"));
  return Pakket.doelPad("", rel.target);
}

/** Controleert dat een onderdeel het gebruikelijke voorvoegsel `w:` gebruikt. */
export function controleerW(wortel: XmlElement) {
  if (voorvoegselVoor(wortel, NS_W) !== "w")
    throw new PaginaFout(paginaTekst("errors.unusualXml"));
}

export interface WordDocument {
  pakket: Pakket;
  pad: string;
  xml: string;
  wortel: XmlElement;
  body: XmlElement;
}
export function openDocument(pakket: Pakket): WordDocument {
  const pad = documentPad(pakket);
  const xml = pakket.lees(pad);
  const wortel = leesXml(xml);
  controleerW(wortel);
  const body = kind(wortel, "body");
  if (!body) throw new PaginaFout(paginaTekst("errors.noBody"));
  return { pakket, pad, xml, wortel, body };
}

// ---------------------------------------------------------------------------
// Kinderen in schemavolgorde

/** Volgorde van de kinderen van w:sectPr (CT_SectPr). */
export const SECTPR_VOLGORDE = [
  "headerReference",
  "footerReference",
  "footnotePr",
  "endnotePr",
  "type",
  "pgSz",
  "pgMar",
  "paperSrc",
  "pgBorders",
  "lnNumType",
  "pgNumType",
  "cols",
  "formProt",
  "vAlign",
  "noEndnote",
  "titlePg",
  "textDirection",
  "bidi",
  "rtlGutter",
  "docGrid",
  "printerSettings",
  "sectPrChange",
];
/** Volgorde van de kinderen van w:settings (CT_Settings), voor zover wij ze schrijven of tegenkomen. */
export const SETTINGS_VOLGORDE = [
  "writeProtection", "view", "zoom", "removePersonalInformation", "removeDateAndTime",
  "doNotDisplayPageBoundaries", "displayBackgroundShape", "printPostScriptOverText",
  "printFractionalCharacterWidth", "printFormsData", "embedTrueTypeFonts", "embedSystemFonts",
  "saveSubsetFonts", "saveFormsData", "mirrorMargins", "alignBordersAndEdges",
  "bordersDoNotSurroundHeader", "bordersDoNotSurroundFooter", "gutterAtTop", "hideSpellingErrors",
  "hideGrammaticalErrors", "activeWritingStyle", "proofState", "formsDesign", "attachedTemplate",
  "linkStyles", "stylePaneFormatFilter", "stylePaneSortMethod", "documentType", "mailMerge",
  "revisionView", "trackRevisions", "doNotTrackMoves", "doNotTrackFormatting", "documentProtection",
  "autoFormatOverride", "styleLockTheme", "styleLockQFSet", "defaultTabStop", "autoHyphenation",
  "consecutiveHyphenLimit", "hyphenationZone", "doNotHyphenateCaps", "showEnvelope", "summaryLength",
  "clickAndTypeStyle", "defaultTableStyle", "evenAndOddHeaders", "bookFoldRevPrinting",
  "bookFoldPrinting", "bookFoldPrintingSheets", "drawingGridHorizontalSpacing",
  "drawingGridVerticalSpacing", "displayHorizontalDrawingGridEvery", "displayVerticalDrawingGridEvery",
  "doNotUseMarginsForDrawingGridOrigin", "drawingGridHorizontalOrigin", "drawingGridVerticalOrigin",
  "doNotShadeFormData", "noPunctuationKerning", "characterSpacingControl", "printTwoOnOne",
  "strictFirstAndLastChars", "noLineBreaksAfter", "noLineBreaksBefore", "savePreviewPicture",
  "doNotValidateAgainstSchema", "saveInvalidXml", "ignoreMixedContent", "alwaysShowPlaceholderText",
  "doNotDemarcateInvalidXml", "saveXmlDataOnly", "useXSLTWhenSaving", "saveThroughXslt", "showXMLTags",
  "alwaysMergeEmptyNamespace", "updateFields", "hdrShapeDefaults", "footnotePr", "endnotePr", "compat",
  "docVars", "rsids", "mathPr", "attachedSchema", "themeFontLang", "clrSchemeMapping",
  "doNotIncludeSubdocsInStats", "doNotAutoCompressPictures", "forceUpgrade", "captions",
  "readModeInkLockDown", "smartTagType", "schemaLibrary", "shapeDefaults", "doNotEmbedSmartTags",
  "decimalSymbol", "listSeparator",
];
/** Volgorde in w:footnotePr/w:endnotePr (sectie en instellingen). */
export const NOTEPR_VOLGORDE = ["pos", "numFmt", "numStart", "numRestart", "footnote", "endnote"];
/** Volgorde in w:pPr, voor zover wij erin schrijven. */
export const PPR_VOLGORDE = [
  "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl", "numPr",
  "suppressLineNumbers", "pBdr", "shd", "tabs", "suppressAutoHyphens", "kinsoku", "wordWrap",
  "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid",
  "spacing", "ind", "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc", "textDirection",
  "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr", "pPrChange",
];

/**
 * Vervangt (of verwijdert, bij `nieuw === null`) de kinderen met deze naam van
 * een element in een stuk XML, of voegt het nieuwe kind in op de plek die de
 * schemavolgorde voorschrijft. Werkt op het eerste element van `bron` (dat het
 * hele fragment moet zijn) en geeft het gewijzigde fragment terug.
 */
export function zetKind(bron: string, lokaal: string, nieuw: string | null, volgorde: readonly string[]): string {
  const el = leesXml(bron);
  const bestaand = kinderen(el, lokaal);
  if (bestaand.length) {
    const w: Vervanging[] = bestaand.map((b, i) => ({ start: b.start, eind: b.eind, tekst: i === 0 && nieuw ? nieuw : "" }));
    return vervang(bron, w);
  }
  if (nieuw === null) return bron;
  const rang = volgorde.indexOf(lokaal);
  const volgende = elementen(el).find((k) => {
    const r = volgorde.indexOf(k.lokaal);
    return r >= 0 && rang >= 0 && r > rang;
  });
  if (el.leeg) {
    // <w:x/> → <w:x>nieuw</w:x>
    const begin = bron.slice(el.start, el.inhoudStart - 2).replace(/\s+$/, "");
    return bron.slice(0, el.start) + `${begin}>${nieuw}</${el.naam}>` + bron.slice(el.eind);
  }
  const p = volgende ? volgende.start : el.inhoudEind;
  return bron.slice(0, p) + nieuw + bron.slice(p);
}

/**
 * Attributen van een bestaand element, bijgewerkt: `null` verwijdert,
 * `undefined` laat staan. Geeft de begintag-attributen als tekst.
 */
export function bijgewerkteAttrs(el: XmlElement | null | undefined, wijziging: Record<string, string | number | null | undefined>) {
  const attrs: Record<string, string | number | undefined> = {};
  for (const [n, w] of Object.entries(el?.attrs ?? {})) attrs[n] = w;
  for (const [n, w] of Object.entries(wijziging)) {
    if (w === undefined) continue;
    if (w === null) delete attrs[n];
    else attrs[n] = w;
  }
  return attrTekst(attrs);
}

/** Het eerste kind met deze naam in een fragment (het fragment zelf wordt ontleed). */
export function kindVan(fragment: string, lokaal: string) {
  return kind(leesXml(fragment), lokaal);
}

// ---------------------------------------------------------------------------
// Secties

export interface Sectie {
  index: number;
  /** Het sectPr-element; null als het document er (nog) geen heeft. */
  el: XmlElement | null;
  /** De alinea die de sectie afsluit (null voor de laatste sectie in w:body). */
  alinea: XmlElement | null;
}

/**
 * Alle secties in volgorde. Een sectie eindigt met een alinea met
 * w:pPr/w:sectPr; de laatste sectie staat in w:body/w:sectPr.
 */
export function secties(doc: WordDocument): Sectie[] {
  const uit: Sectie[] = [];
  const loop = (el: XmlElement) => {
    for (const k of elementen(el)) {
      if (k.lokaal === "p") {
        const s = kind(kind(k, "pPr"), "sectPr");
        if (s) uit.push({ index: uit.length, el: s, alinea: k });
      } else if (k.lokaal !== "sectPr" && k.lokaal !== "tbl") loop(k);
    }
  };
  loop(doc.body);
  const laatste = elementen(doc.body).filter((e) => e.lokaal === "sectPr").pop() ?? null;
  uit.push({ index: uit.length, el: laatste, alinea: null });
  return uit;
}

/** Index van de sectie waarin een positie in document.xml valt. */
export function sectieBijPositie(lijst: Sectie[], positie: number) {
  for (const s of lijst) if (s.alinea && positie < s.alinea.eind) return s.index;
  return lijst.length - 1;
}

export const STANDAARD_SECTPR =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>';

/**
 * Past per sectie het sectPr-fragment aan. `wijzig` krijgt het bestaande
 * fragment (of een standaard als er geen is) en geeft het nieuwe terug.
 * Schrijft document.xml terug in het pakket.
 */
export function wijzigSectPrs(doc: WordDocument, doelen: readonly number[], wijzig: (sectPr: string, sectie: Sectie) => string) {
  const lijst = secties(doc);
  const w: Vervanging[] = [];
  for (const i of new Set(doelen)) {
    const s = lijst[i];
    if (!s) continue;
    if (s.el) {
      const oud = doc.xml.slice(s.el.start, s.el.eind);
      const nieuw = wijzig(oud, s);
      if (nieuw !== oud) w.push({ start: s.el.start, eind: s.el.eind, tekst: nieuw });
    } else {
      const nieuw = wijzig(STANDAARD_SECTPR, s);
      w.push({ start: doc.body.inhoudEind, eind: doc.body.inhoudEind, tekst: nieuw });
    }
  }
  if (!w.length) return doc;
  const xml = vervang(doc.xml, w);
  doc.pakket.schrijf(doc.pad, xml);
  return openDocument(doc.pakket);
}

/** Twips uit een attribuut. */
export const twips = (el: XmlElement | null | undefined, naam: string, standaard = 0) => {
  const v = Number(attr(el, naam));
  return Number.isFinite(v) && attr(el, naam) !== undefined ? v : standaard;
};

/** Tekstbreedte (twips) van een sectie: paginabreedte min marges en rugmarge. */
export function tekstbreedte(sectPr: XmlElement | null) {
  const pgSz = kind(sectPr, "pgSz");
  const pgMar = kind(sectPr, "pgMar");
  const breedte = twips(pgSz, "w", 11906);
  const marge = twips(pgMar, "left", 1417) + twips(pgMar, "right", 1417) + twips(pgMar, "gutter", 0);
  return Math.max(1440, breedte - marge);
}

// ---------------------------------------------------------------------------
// Instellingen (settings.xml)

export function instellingenPad(pakket: Pakket, docPad: string, maak = true) {
  const rel = pakket.relaties(docPad).find((r) => r.type === WREL.settings);
  if (rel) return Pakket.doelPad(docPad, rel.target);
  if (!maak) return null;
  const pad = pakket.vrijPad("word/settings#.xml").replace("settings1.xml", "settings.xml");
  pakket.schrijf(pad, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings ${W_NS_ATTR}></w:settings>`);
  pakket.voegOverrideToe(pad, WTYPE.settings);
  pakket.voegRelatieToe(docPad, WREL.settings, pad);
  return pad;
}

/** Wijzigt het wortelelement van settings.xml via `zetKind`. */
export function wijzigInstellingen(pakket: Pakket, docPad: string, wijzig: (settings: string) => string) {
  const pad = instellingenPad(pakket, docPad)!;
  const xml = pakket.lees(pad);
  const wortel = leesXml(xml);
  controleerW(wortel);
  const oud = xml.slice(wortel.start, wortel.eind);
  const nieuw = wijzig(oud);
  if (nieuw !== oud) pakket.schrijf(pad, xml.slice(0, wortel.start) + nieuw + xml.slice(wortel.eind));
}

export function leesInstellingen(pakket: Pakket, docPad: string): XmlElement | null {
  const pad = instellingenPad(pakket, docPad, false);
  return pad && pakket.heeft(pad) ? leesXml(pakket.lees(pad)) : null;
}

/** Aan/uit-element (`<w:x/>`, `w:val="0"` = uit). */
export function aan(el: XmlElement | null | undefined) {
  if (!el) return false;
  const v = attr(el, "val");
  return v === undefined || !["0", "false", "off"].includes(v);
}

// ---------------------------------------------------------------------------
// Stijlen

export function stijlenPad(pakket: Pakket, docPad: string) {
  const rel = pakket.relaties(docPad).find((r) => r.type === WREL.styles);
  if (rel) return Pakket.doelPad(docPad, rel.target);
  const pad = "word/styles.xml";
  if (!pakket.heeft(pad)) {
    pakket.schrijf(pad, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles ${W_NS_ATTR}></w:styles>`);
    pakket.voegOverrideToe(pad, WTYPE.styles);
  }
  pakket.voegRelatieToe(docPad, WREL.styles, pad);
  return pad;
}

/** Bestaande stijl-id's (alle soorten). */
export function stijlIds(pakket: Pakket, docPad: string) {
  const pad = stijlenPad(pakket, docPad);
  const wortel = leesXml(pakket.lees(pad));
  return new Set(kinderen(wortel, "style").map((s) => attr(s, "styleId") ?? ""));
}

/** Voegt stijldefinities toe die nog niet bestaan (op styleId). */
export function zorgVoorStijlen(pakket: Pakket, docPad: string, stijlen: Record<string, string>) {
  const pad = stijlenPad(pakket, docPad);
  const xml = pakket.lees(pad);
  const wortel = leesXml(xml);
  controleerW(wortel);
  const bestaand = new Set(kinderen(wortel, "style").map((s) => attr(s, "styleId") ?? ""));
  const toe = Object.entries(stijlen)
    .filter(([id]) => !bestaand.has(id))
    .map(([, def]) => def)
    .join("");
  if (!toe) return;
  if (wortel.leeg) {
    pakket.schrijf(pad, xml.slice(0, wortel.start) + xml.slice(wortel.start, wortel.inhoudStart - 2).replace(/\s+$/, "") + `>${toe}</${wortel.naam}>` + xml.slice(wortel.eind));
  } else pakket.schrijf(pad, vervang(xml, [{ start: wortel.inhoudEind, eind: wortel.inhoudEind, tekst: toe }]));
}

// ---------------------------------------------------------------------------
// Onderdelen

/** Een nieuw onderdeel met relatie vanuit het document. Geeft pad en relatie-id. */
export function nieuwOnderdeel(pakket: Pakket, docPad: string, patroon: string, type: string, rel: string, inhoud: string) {
  const pad = pakket.vrijPad(patroon);
  pakket.schrijf(pad, inhoud);
  pakket.voegOverrideToe(pad, type);
  const rid = pakket.voegRelatieToe(docPad, rel, pad);
  return { pad, rid };
}

/** Pad van het doel van een relatie van een bepaald type (eerste). */
export function onderdeelVan(pakket: Pakket, docPad: string, type: string) {
  const rel = pakket.relaties(docPad).find((r) => r.type === type && !r.extern);
  return rel ? Pakket.doelPad(docPad, rel.target) : null;
}

/** De hoogste numerieke waarde van een attribuut in een stuk XML (voor nieuwe id's). */
export function hoogsteId(xml: string, element: string, attribuut = "w:id") {
  let max = 0;
  const re = new RegExp(`<w:${element}\\b[^>]*?\\s${attribuut}="(-?\\d+)"`, "g");
  for (const m of xml.matchAll(re)) max = Math.max(max, Number(m[1]));
  return max;
}

// ---------------------------------------------------------------------------
// Markering bij de cursor

/** Een tekst die de editor op de cursorplek invoegt, zodat wij die plek in de XML terugvinden. */
export function nieuweMarkering() {
  const r = Math.random().toString(36).slice(2, 10).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  return `OOSMARK${r}Q`;
}

export interface Markeringsplek {
  /** Onderdeel waarin de markering staat. */
  pad: string;
  xml: string;
  wortel: XmlElement;
  /** Het w:t-element met de markering. */
  t: XmlElement;
  /** De run (w:r) en alinea (w:p) eromheen. */
  run: XmlElement;
  alinea: XmlElement;
  /** Tekst van de alinea vóór en na de markering. */
  ervoor: string;
  erna: string;
}

const MARKEERBARE_DELEN = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

/** Zoekt de markering in de tekstonderdelen. */
export function vindMarkering(pakket: Pakket, markering: string): Markeringsplek | null {
  for (const pad of pakket.namen()) {
    if (!MARKEERBARE_DELEN.test(pad)) continue;
    const xml = pakket.lees(pad);
    if (!xml.includes(markering)) continue;
    const wortel = leesXml(xml);
    const t = zoekAlle(wortel, "t").find((el) => tekstVan(el).includes(markering));
    if (!t) throw new PaginaFout(paginaTekst("errors.cursorLost"));
    let run: XmlElement | null = t.ouder;
    while (run && run.lokaal !== "r") run = run.ouder;
    let alinea: XmlElement | null = run;
    while (alinea && alinea.lokaal !== "p") alinea = alinea.ouder;
    if (!run || !alinea) throw new PaginaFout(paginaTekst("errors.cursorLost"));
    const alineaTekst = zoekAlle(alinea, "t").map(tekstVan).join("");
    const i = alineaTekst.indexOf(markering);
    return {
      pad,
      xml,
      wortel,
      t,
      run,
      alinea,
      ervoor: alineaTekst.slice(0, i),
      erna: alineaTekst.slice(i + markering.length),
    };
  }
  return null;
}

/** Verwijdert de markering uit een w:t-element (als tekstvervanging). */
function zonderMarkering(xml: string, t: XmlElement, markering: string): Vervanging {
  const inhoud = xml.slice(t.inhoudStart, t.inhoudEind).replace(markering, "");
  return { start: t.inhoudStart, eind: t.inhoudEind, tekst: inhoud };
}

/** Haalt alleen de markering weg (bijvoorbeeld na een mislukte bewerking). */
export function verwijderMarkering(pakket: Pakket, markering: string) {
  const plek = vindMarkering(pakket, markering);
  if (!plek) return;
  pakket.schrijf(plek.pad, vervang(plek.xml, [zonderMarkering(plek.xml, plek.t, markering)]));
}

/**
 * Splitst de run met de markering en zet `invoeging` (runs of ander
 * inline-materiaal) op de plek van de markering. `invoeging` krijgt de
 * opmaak (w:rPr) van de run mee, zodat die desgewenst kan worden overgenomen.
 */
export function vervangMarkeringInline(plek: Markeringsplek, markering: string, invoeging: (rPr: string) => string) {
  const { voor, na, rPr } = splitsRun(plek, markering);
  return vervang(plek.xml, [{ start: plek.run.start, eind: plek.run.eind, tekst: voor + invoeging(rPr) + na }]);
}

/**
 * Splitst de alinea met de markering in tweeën en zet `tussen` (hele
 * alinea's) ertussen. Lege helften vallen weg; de tweede helft houdt de
 * oorspronkelijke begintag (paraId) en een eventuele sectie-einde. Staat de
 * run niet direct in de alinea (bijvoorbeeld in een hyperlink), dan komt het
 * blok na de alinea.
 */
export function splitsAlineaBijMarkering(plek: Markeringsplek, markering: string, tussen: (pPrZonderSectie: string) => string) {
  const { xml, alinea, run } = plek;
  const pPrEl = kind(alinea, "pPr");
  const pPr = pPrEl ? xml.slice(pPrEl.start, pPrEl.eind) : "";
  const sectEl = kind(pPrEl, "sectPr");
  const pPrZonder = sectEl && pPrEl ? xml.slice(pPrEl.start, sectEl.start) + xml.slice(sectEl.eind, pPrEl.eind) : pPr;
  if (run.ouder !== alinea || alinea.leeg) {
    const weg = zonderMarkering(xml, plek.t, markering);
    return vervang(xml, [weg, { start: alinea.eind, eind: alinea.eind, tekst: tussen(pPrZonder) }]);
  }
  const { voor, na } = splitsRun(plek, markering);
  const kinderenVoor: string[] = [];
  const kinderenNa: string[] = [];
  let gezien = false;
  for (const k of alinea.kinderen) {
    if (k.soort !== "element" || k === pPrEl) continue;
    if (k === run) {
      gezien = true;
      continue;
    }
    (gezien ? kinderenNa : kinderenVoor).push(xml.slice(k.start, k.eind));
  }
  const deelA = kinderenVoor.join("") + voor;
  const deelB = na + kinderenNa.join("");
  const begin = xml.slice(alinea.start, alinea.inhoudStart);
  const heeftTekst = (s: string) => /<w:(t|tab|drawing|pict|object|sym|fldSimple|footnoteReference|endnoteReference)\b/.test(s);
  const delen: string[] = [];
  if (heeftTekst(deelA)) delen.push(`<w:p>${pPrZonder}${deelA}</w:p>`);
  delen.push(tussen(pPrZonder));
  if (heeftTekst(deelB) || sectEl || !heeftTekst(deelA)) delen.push(`${begin}${pPr}${deelB}</w:p>`);
  else if (deelB) delen[0] = `<w:p>${pPrZonder}${deelA}${deelB}</w:p>`;
  return vervang(xml, [{ start: alinea.start, eind: alinea.eind, tekst: delen.join("") }]);
}

/** De run met de markering in twee runs (zonder markering), met de opmaak van de run. */
function splitsRun(plek: Markeringsplek, markering: string) {
  const { xml, run, t } = plek;
  const rPrEl = kind(run, "rPr");
  const rPr = rPrEl ? xml.slice(rPrEl.start, rPrEl.eind) : "";
  const begin = xml.slice(run.start, run.leeg ? run.eind : run.inhoudStart);
  const voor: string[] = [];
  const na: string[] = [];
  let gezien = false;
  for (const k of run.kinderen) {
    if (k.soort !== "element" || k === rPrEl) continue;
    if (k === t) {
      gezien = true;
      continue;
    }
    (gezien ? na : voor).push(xml.slice(k.start, k.eind));
  }
  const inhoud = xml.slice(t.inhoudStart, t.inhoudEind);
  const i = inhoud.indexOf(markering);
  const tVoor = inhoud.slice(0, i);
  const tNa = inhoud.slice(i + markering.length);
  const tTag = (tekst: string) => `<w:t xml:space="preserve">${tekst}</w:t>`;
  const deelVoor = [...voor, ...(tVoor ? [tTag(tVoor)] : [])];
  const deelNa = [...(tNa ? [tTag(tNa)] : []), ...na];
  const maakRun = (delen: string[]) => (delen.length ? `${begin}${rPr}${delen.join("")}</w:r>` : "");
  return { voor: maakRun(deelVoor), na: maakRun(deelNa), rPr };
}

/**
 * Zet blokmateriaal (alinea's, sdt) bij de alinea met de markering: is de
 * alinea verder leeg, dan vervangt het blok de alinea; staat de markering aan
 * het begin, dan komt het blok ervoor; anders erna. De markering verdwijnt.
 */
export function vervangMarkeringBlok(plek: Markeringsplek, markering: string, blok: string) {
  const { xml, alinea } = plek;
  const inCel = alinea.ouder?.lokaal === "tc";
  if (!inCel && !plek.ervoor.trim() && !plek.erna.trim() && !zoekAlle(alinea, "drawing").length)
    return vervang(xml, [{ start: alinea.start, eind: alinea.eind, tekst: blok }]);
  const weg = zonderMarkering(xml, plek.t, markering);
  const p = plek.ervoor.trim() ? alinea.eind : alinea.start;
  return vervang(xml, [weg, { start: p, eind: p, tekst: blok }]);
}

/** Alineatekst zonder verwijderde tekst. */
export function alineaTekst(p: XmlElement) {
  return zoekAlle(p, "t")
    .filter((t) => t.lokaal === "t")
    .map(tekstVan)
    .join("");
}

/** Normaliseert tekst om koppen te vergelijken. */
export const vergelijkTekst = (tekst: string) =>
  tekst.replace(/[￼­​]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export { ontsnap as xmlTekst };
