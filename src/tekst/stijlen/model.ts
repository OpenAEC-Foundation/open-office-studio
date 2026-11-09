/**
 * Stijlen zoals de engine ze uit het document heeft gelezen: namen in de
 * interfacetaal, opgeloste eigenschappen (met overerving) voor de voorbeelden
 * in de galerij, en welke stijlen het document gebruikt.
 */
import type { CSSProperties } from "react";
import type {
  Document,
  ParagraphFormatting,
  Style,
  StyleDefinitions,
  TextFormatting,
  TableFormatting,
  NumberingDefinitions,
  Theme,
} from "@betteroffice/docx/types/document";
import i18next from "../../i18n/config";
import { formatGetal } from "../../i18n/opmaak";
import type { StijlEigenschappen } from "./stijlenxml";
import { getalIn, type NummerNotatie } from "../lijst/nummering";

/**
 * Ingebouwde stijlen: de interne (Engelse) naam in styles.xml → i18n-sleutel
 * onder `writer:styles.builtin`. Alleen de weergave wordt vertaald; de naam
 * en het styleId in het bestand blijven ongewijzigd.
 */
const INGEBOUWD: Record<string, string> = {
  normal: "normal",
  title: "title",
  subtitle: "subtitle",
  quote: "quote",
  "intense quote": "intenseQuote",
  "list paragraph": "listParagraph",
  "no spacing": "noSpacing",
  caption: "caption",
  strong: "strong",
  emphasis: "emphasis",
  "subtle emphasis": "subtleEmphasis",
  "intense emphasis": "intenseEmphasis",
  "subtle reference": "subtleReference",
  "intense reference": "intenseReference",
  "book title": "bookTitle",
  "toc heading": "tocHeading",
  header: "header",
  footer: "footer",
  "header char": "headerChar",
  "footer char": "footerChar",
  "default paragraph font": "defaultParagraphFont",
  "body text": "bodyText",
  hyperlink: "hyperlink",
  followedhyperlink: "followedHyperlink",
  "normal table": "normalTable",
  "table grid": "tableGrid",
  "no list": "noList",
  "footnote text": "footnoteText",
  "footnote reference": "footnoteReference",
  "endnote text": "endnoteText",
  "endnote reference": "endnoteReference",
  "list bullet": "listBullet",
  "list number": "listNumber",
  list: "list",
  "list continue": "listContinue",
  "annotation text": "annotationText",
  "annotation reference": "annotationReference",
  "balloon text": "balloonText",
  "placeholder text": "placeholderText",
  "intense quote char": "intenseQuoteChar",
  "quote char": "quoteChar",
  "title char": "titleChar",
  "subtitle char": "subtitleChar",
  macro: "macro",
  "plain text": "plainText",
  "normal (web)": "normalWeb",
};

/** Genummerde varianten ("List Bullet 2") → sleutel met {{level}}. */
const GENUMMERD: Record<string, string> = {
  "list bullet": "listBulletLevel",
  "list number": "listNumberLevel",
  "list continue": "listContinueLevel",
  list: "listLevel",
  "body text": "bodyTextLevel",
};

const ingebouwd = (sleutel: string, waarden?: Record<string, string>) =>
  i18next.t(`writer:styles.builtin.${sleutel}`, waarden);

/**
 * De weergavenaam van een stijl in de interfacetaal, zoals Word die toont
 * (Nederlands: "Heading 1" als "Kop 1"). Eigen stijlen houden hun naam.
 */
export function stijlNaam(stijl: Pick<Style, "name" | "styleId">): string {
  const naam = stijl.name ?? stijl.styleId;
  const laag = naam.toLowerCase().trim();
  if (INGEBOUWD[laag]) return ingebouwd(INGEBOUWD[laag]);
  let m = /^heading (\d)( char)?$/.exec(laag);
  if (m) return ingebouwd(m[2] ? "headingChar" : "heading", { level: m[1] });
  m = /^toc (\d)$/.exec(laag);
  if (m) return ingebouwd("toc", { level: m[1] });
  m = /^(list bullet|list number|list continue|list|body text) (\d)$/.exec(laag);
  if (m && GENUMMERD[m[1]]) return ingebouwd(GENUMMERD[m[1]], { level: m[2] });
  return naam;
}

export interface OpgelosteStijl {
  lettertype?: string;
  grootte: number;
  vet: boolean;
  cursief: boolean;
  onderstreept: boolean;
  doorgehaald: boolean;
  hoofdletters: boolean;
  kleineHoofdletters: boolean;
  kleur?: string;
  uitlijning?: string;
  ruimteVoor?: number;
  ruimteNa?: number;
  regelafstand?: number;
  inspringLinks?: number;
  eersteRegel?: number;
  taal?: string;
}

function themaLettertype(
  fonts: TextFormatting["fontFamily"],
  thema: Theme | null | undefined,
) {
  if (!fonts) return undefined;
  const themaNaam = fonts.asciiTheme ?? fonts.hAnsiTheme;
  if (themaNaam) {
    const schema = thema?.fontScheme;
    const lt = themaNaam.startsWith("major") ? schema?.majorFont?.latin : schema?.minorFont?.latin;
    if (lt) return lt;
  }
  return fonts.ascii ?? fonts.hAnsi;
}

function themaKleur(kleur: TextFormatting["color"], thema: Theme | null | undefined) {
  if (!kleur || kleur.auto) return undefined;
  if (kleur.themeColor && thema?.colorScheme) {
    const slot = kleur.themeColor as keyof NonNullable<Theme["colorScheme"]>;
    const waarde = thema.colorScheme[slot];
    if (typeof waarde === "string" && /^[0-9a-f]{6}$/i.test(waarde) && !kleur.rgb) return waarde;
  }
  return kleur.rgb && /^[0-9a-f]{6}$/i.test(kleur.rgb) ? kleur.rgb : undefined;
}

/** De samengevoegde rPr en pPr van een stijl met overerving. */
export function opgelosteOpmaak(stijlen: StyleDefinitions | undefined, styleId: string | null | undefined) {
  const keten: Style[] = [];
  const bekend = new Map((stijlen?.styles ?? []).map((s) => [s.styleId, s]));
  let huidig = styleId ? bekend.get(styleId) : stijlen?.styles.find((s) => s.type === "paragraph" && s.default);
  for (let n = 0; huidig && n < 50; n++) {
    keten.unshift(huidig);
    huidig = huidig.basedOn ? bekend.get(huidig.basedOn) : undefined;
  }
  const r: TextFormatting = { ...(stijlen?.docDefaults?.rPr ?? {}) };
  const p: ParagraphFormatting = { ...(stijlen?.docDefaults?.pPr ?? {}) };
  for (const s of keten) {
    Object.assign(r, s.rPr ?? {});
    Object.assign(p, s.pPr ?? {});
  }
  return { r, p };
}

/** Een stijl met al zijn overerving: docDefaults → basisstijlen → stijl. */
export function losOp(
  stijlen: StyleDefinitions | undefined,
  styleId: string | null | undefined,
  thema?: Theme | null,
): OpgelosteStijl {
  const keten: Style[] = [];
  const bekend = new Map((stijlen?.styles ?? []).map((s) => [s.styleId, s]));
  let huidig = styleId ? bekend.get(styleId) : undefined;
  // Tekenstijlen erven niet van de standaard-alineastijl; alinea's wel.
  if (!huidig && !styleId)
    huidig = stijlen?.styles.find((s) => s.type === "paragraph" && s.default);
  for (let n = 0; huidig && n < 50; n++) {
    keten.unshift(huidig);
    huidig = huidig.basedOn ? bekend.get(huidig.basedOn) : undefined;
  }
  const r: TextFormatting = { ...(stijlen?.docDefaults?.rPr ?? {}) };
  const p: ParagraphFormatting = { ...(stijlen?.docDefaults?.pPr ?? {}) };
  for (const s of keten) {
    Object.assign(r, s.rPr ?? {});
    Object.assign(p, s.pPr ?? {});
  }
  return {
    lettertype: themaLettertype(r.fontFamily, thema),
    grootte: (r.fontSize ?? 20) / 2,
    vet: !!r.bold,
    cursief: !!r.italic,
    onderstreept: !!r.underline && r.underline.style !== "none",
    doorgehaald: !!r.strike,
    hoofdletters: !!r.allCaps,
    kleineHoofdletters: !!r.smallCaps,
    kleur: themaKleur(r.color, thema),
    uitlijning: p.alignment,
    ruimteVoor: p.spaceBefore !== undefined ? p.spaceBefore / 20 : undefined,
    ruimteNa: p.spaceAfter !== undefined ? p.spaceAfter / 20 : undefined,
    regelafstand:
      p.lineSpacing !== undefined && (!p.lineSpacingRule || p.lineSpacingRule === "auto")
        ? Math.round((p.lineSpacing / 240) * 100) / 100
        : undefined,
    inspringLinks: p.indentLeft !== undefined ? Math.round((p.indentLeft / 567) * 100) / 100 : undefined,
    eersteRegel:
      p.indentFirstLine !== undefined
        ? Math.round(((p.hangingIndent ? -1 : 1) * p.indentFirstLine * 100) / 567) / 100
        : undefined,
    taal: r.language?.latin,
  };
}

/**
 * Alleen de tekenopmaak die een (teken)stijl en zijn basisstijlen zelf
 * zetten, zonder documentstandaarden: wat er bij toepassen verandert.
 */
export function eigenTekenopmaak(
  stijlen: StyleDefinitions | undefined,
  styleId: string,
  thema?: Theme | null,
): StijlEigenschappen {
  const bekend = new Map((stijlen?.styles ?? []).map((s) => [s.styleId, s]));
  const keten: Style[] = [];
  for (let s = bekend.get(styleId), n = 0; s && n < 50; n++) {
    keten.unshift(s);
    s = s.basedOn ? bekend.get(s.basedOn) : undefined;
  }
  const r: TextFormatting = {};
  for (const s of keten) Object.assign(r, s.rPr ?? {});
  return uitOpmaak(r, undefined, "character", thema);
}

/** CSS voor het voorbeeld in de galerij, begrensd zodat het in het lint past. */
export function voorbeeldStijl(o: OpgelosteStijl, maxPunt = 16): CSSProperties {
  return {
    fontFamily: o.lettertype ? `"${o.lettertype}", sans-serif` : undefined,
    fontSize: `${Math.max(8, Math.min(maxPunt, o.grootte))}pt`,
    fontWeight: o.vet ? 700 : 400,
    fontStyle: o.cursief ? "italic" : "normal",
    textDecoration: [o.onderstreept && "underline", o.doorgehaald && "line-through"].filter(Boolean).join(" ") || "none",
    textTransform: o.hoofdletters ? "uppercase" : undefined,
    fontVariant: o.kleineHoofdletters ? "small-caps" : undefined,
    color: o.kleur ? `#${o.kleur}` : undefined,
  };
}

/** Wat de stijl-editor als beginwaarden toont. */
export function alsEigenschappen(o: OpgelosteStijl): StijlEigenschappen {
  return {
    lettertype: o.lettertype ?? null,
    grootte: o.grootte,
    vet: o.vet,
    cursief: o.cursief,
    onderstreept: o.onderstreept,
    kleur: o.kleur ?? null,
    uitlijning: (["left", "center", "right", "both"].includes(o.uitlijning ?? "")
      ? o.uitlijning
      : "left") as StijlEigenschappen["uitlijning"],
    ruimteVoor: o.ruimteVoor ?? 0,
    ruimteNa: o.ruimteNa ?? 0,
    regelafstand: o.regelafstand ?? 1,
    inspringLinks: o.inspringLinks ?? 0,
    eersteRegel: o.eersteRegel ?? 0,
  };
}

/**
 * Opmaak van de selectie als stijleigenschappen ("bijwerken op basis van de
 * selectie"). Alleen wat de selectie werkelijk meldt, gaat mee.
 */
export function uitOpmaak(
  tekst: TextFormatting | undefined,
  alinea: ParagraphFormatting | undefined,
  soort: "paragraph" | "character" | "table" | "numbering" = "paragraph",
  thema?: Theme | null,
): StijlEigenschappen {
  const e: StijlEigenschappen = {};
  if (tekst) {
    const lt = themaLettertype(tekst.fontFamily, thema);
    if (lt) e.lettertype = lt;
    if (tekst.fontSize) e.grootte = tekst.fontSize / 2;
    if (tekst.bold !== undefined) e.vet = tekst.bold;
    if (tekst.italic !== undefined) e.cursief = tekst.italic;
    if (tekst.underline) e.onderstreept = tekst.underline.style !== "none";
    if (tekst.underline) {
      e.onderstreping = tekst.underline.style;
      e.onderstrepingKleur = themaKleur(tekst.underline.color, thema);
    }
    if (tekst.strike !== undefined) e.doorgehaald = tekst.strike;
    if (tekst.allCaps !== undefined) e.hoofdletters = tekst.allCaps;
    if (tekst.smallCaps !== undefined) e.kleineHoofdletters = tekst.smallCaps;
    if (tekst.doubleStrike !== undefined)
      e.dubbelDoorgehaald = tekst.doubleStrike;
    if (tekst.hidden !== undefined) e.verborgen = tekst.hidden;
    if (tekst.vertAlign) e.verticaal = tekst.vertAlign;
    if (tekst.spacing !== undefined) e.tekenafstand = tekst.spacing;
    if (tekst.scale !== undefined) e.schaal = tekst.scale;
    if (tekst.position !== undefined) e.positie = tekst.position;
    if (tekst.kerning !== undefined) e.spatiering = tekst.kerning;
    const kleur = themaKleur(tekst.color, thema);
    if (kleur) e.kleur = kleur.toUpperCase();
  }
  if (tekst?.language?.latin) e.taal = tekst.language.latin;
  if (alinea && soort !== "character") {
    if (alinea.tabs) e.tabs = alinea.tabs as StijlEigenschappen["tabs"];
    if (alinea.borders) e.randen = Object.fromEntries(Object.entries(alinea.borders).filter(([, b]) => !!b).map(([k, b]) => [k, { style: b!.style ?? "single", size: b!.size, space: b!.space, ...(themaKleur(b!.color, thema) ? { color: { rgb: themaKleur(b!.color, thema)! } } : {}) }]));
    if (alinea.shading) e.arcering = { pattern: alinea.shading.pattern, ...(themaKleur(alinea.shading.fill, thema) ? { fill: { rgb: themaKleur(alinea.shading.fill, thema)! } } : {}) };
    if (alinea.numPr?.numId !== undefined) e.lijst = { numId: alinea.numPr.numId, ilvl: alinea.numPr.ilvl ?? 0 };
    const a = alinea.alignment;
    if (a === "left" || a === "center" || a === "right" || a === "both") e.uitlijning = a;
    if (alinea.spaceBefore !== undefined) e.ruimteVoor = alinea.spaceBefore / 20;
    if (alinea.spaceAfter !== undefined) e.ruimteNa = alinea.spaceAfter / 20;
    if (alinea.lineSpacing !== undefined && (!alinea.lineSpacingRule || alinea.lineSpacingRule === "auto"))
      e.regelafstand = Math.round((alinea.lineSpacing / 240) * 100) / 100;
    if (alinea.indentLeft !== undefined) e.inspringLinks = Math.round((alinea.indentLeft / 567) * 100) / 100;
    if (alinea.indentRight !== undefined)
      e.inspringRechts = Math.round((alinea.indentRight / 567) * 100) / 100;
    if (
      alinea.lineSpacing !== undefined &&
      (alinea.lineSpacingRule === "exact" ||
        alinea.lineSpacingRule === "atLeast")
    )
      e.regelafstandPt = {
        pt: alinea.lineSpacing / 20,
        regel: alinea.lineSpacingRule,
      };
    if (alinea.keepNext !== undefined) e.bijVolgende = alinea.keepNext;
    if (alinea.keepLines !== undefined) e.regelsBijElkaar = alinea.keepLines;
    if (alinea.pageBreakBefore !== undefined)
      e.paginaEindeVoor = alinea.pageBreakBefore;
    if (alinea.widowControl !== undefined)
      e.zwevendeRegels = alinea.widowControl;
    if (alinea.contextualSpacing !== undefined)
      e.contextueel = alinea.contextualSpacing;
    if (alinea.indentFirstLine !== undefined)
      e.eersteRegel = Math.round(((alinea.hangingIndent ? -1 : 1) * alinea.indentFirstLine * 100) / 567) / 100;
  }
  return e;
}

export function tabelEigenschappen(tabel: TableFormatting | undefined, thema?: Theme): StijlEigenschappen {
  if (!tabel) return {};
  const randen = tabel.borders ? Object.fromEntries(Object.entries(tabel.borders).filter(([, b]) => !!b).map(([k, b]) => [k, { style: b!.style ?? "single", size: b!.size, space: b!.space, ...(themaKleur(b!.color, thema) ? { color: { rgb: themaKleur(b!.color, thema)! } } : {}) }])) : undefined;
  const fill = themaKleur(tabel.shading?.fill, thema);
  return { ...(randen ? { tabelRanden: randen } : {}), ...(tabel.shading ? { tabelArcering: { pattern: tabel.shading.pattern, ...(fill ? { fill: { rgb: fill } } : {}) } } : {}) };
}

export function lijstVoorbeelden(
  stijlen: StyleDefinitions | undefined,
  nummering: NumberingDefinitions | undefined,
  id: string,
): string[] {
  const num = opgelosteOpmaak(stijlen, id).p.numPr;
  const instance = nummering?.nums.find((n) => n.numId === num?.numId),
    abstract = nummering?.abstractNums.find(
      (a) => a.abstractNumId === instance?.abstractNumId,
    ),
    ilvl = num?.ilvl ?? 0;
  const override = instance?.levelOverrides?.find((o) => o.ilvl === ilvl),
    niveau = override?.lvl ?? abstract?.levels.find((l) => l.ilvl === ilvl);
  if (!niveau || !num?.numId || niveau.numFmt === "none") return ["Aa", "Bb"];
  return [0, 1].map((n) => {
    const prefix =
      niveau.numFmt === "bullet"
        ? niveau.lvlText
        : niveau.lvlText.replace(/%(\d)/g, (_, d) => {
            const l = Number(d) - 1,
              lev = abstract?.levels.find((v) => v.ilvl === l),
              start =
                l === ilvl
                  ? (override?.startOverride ?? niveau.start ?? 1) + n
                  : (lev?.start ?? 1);
            const format =
              l === ilvl ? niveau.numFmt : (lev?.numFmt ?? "decimal");
            return [
              "decimal",
              "lowerRoman",
              "upperRoman",
              "lowerLetter",
              "upperLetter",
            ].includes(format)
              ? getalIn(format as NummerNotatie, start)
              : String(start);
          });
    return `${prefix} ${n ? "Bb" : "Aa"}`;
  });
}

/** Four real cells show first-row/banding/column formatting, not a generic icon. */
export function tabelVoorbeeld(
  stijlen: StyleDefinitions | undefined,
  id: string,
  thema?: Theme,
): CSSProperties[] {
  const keten: Style[] = [],
    gezien = new Set<string>();
  let huidig = stijlen?.styles.find((s) => s.styleId === id);
  while (huidig && !gezien.has(huidig.styleId)) {
    gezien.add(huidig.styleId);
    keten.unshift(huidig);
    huidig = stijlen?.styles.find((s) => s.styleId === huidig!.basedOn);
  }
  const basis = losOp(stijlen, id, thema);
  return Array.from({ length: 4 }, (_, n) => {
    let tbl: TableFormatting = {},
      tc: NonNullable<Style["tcPr"]> = {},
      run: TextFormatting = {};
    const types = [
      "wholeTable",
      n < 2 ? "firstRow" : "band1Horz",
      n % 2 === 0 ? "firstCol" : "lastCol",
      n >= 2 ? "lastRow" : "",
    ];
    for (const s of keten) {
      Object.assign(tbl, s.tblPr);
      Object.assign(tc, s.tcPr);
      Object.assign(run, s.rPr);
      for (const type of types)
        for (const part of s.tblStylePr ?? [])
          if (part.type === type) {
            Object.assign(tbl, part.tblPr);
            Object.assign(tc, part.tcPr);
            Object.assign(run, part.rPr);
          }
    }
    const border =
        tc.borders?.top ?? (n < 2 ? tbl.borders?.top : tbl.borders?.insideH),
      kleur = themaKleur(border?.color, thema) ?? "888888",
      fill = themaKleur(tc.shading?.fill ?? tbl.shading?.fill, thema);
    const style = border?.style ?? "single",
      lijn =
        style === "nil" || style === "none"
          ? "none"
          : style === "double"
            ? "double"
            : style.includes("dash")
              ? "dashed"
              : style === "dotted"
                ? "dotted"
                : "solid";
    return {
      border: `${(border?.size ?? 4) / 8}pt ${lijn} #${kleur}`,
      background: fill ? `#${fill}` : undefined,
      color: themaKleur(run.color, thema)
        ? `#${themaKleur(run.color, thema)}`
        : basis.kleur
          ? `#${basis.kleur}`
          : undefined,
      fontWeight: (run.bold ?? basis.vet) ? 700 : 400,
      fontStyle: (run.italic ?? basis.cursief) ? "italic" : "normal",
      padding: "1px 4px",
    };
  });
}

/** Nearest enclosing table, including tables in header/footer and note stories. */
export function tabelBijAlinea(doc: Document | null | undefined, paraId?: string): TableFormatting | undefined {
  if (!doc || !paraId) return;
  let budget = 200000;
  function vind(k: unknown, tabel?: TableFormatting): { gevonden: boolean; tabel?: TableFormatting } {
    if (!k || typeof k !== "object" || budget-- <= 0) return { gevonden: false };
    if (Array.isArray(k)) { for (const x of k) { const r = vind(x, tabel); if (r.gevonden) return r; } return { gevonden: false }; }
    const n = k as { type?: string; paraId?: string; id?: string; formatting?: TableFormatting; content?: unknown; rows?: unknown; cells?: unknown;
    };
    if (n.type === "paragraph" && (n.paraId === paraId || n.id === paraId)) return { gevonden: true, tabel };
    const nieuw = n.type === "table" ? n.formatting : tabel;
    for (const inhoud of [n.content, n.rows, n.cells]) { const r = vind(inhoud, nieuw); if (r.gevonden) return r; }
    return { gevonden: false };
  }
  const p = doc.package;
  return vind([p.document, ...(p.headers?.values() ?? []), ...(p.footers?.values() ?? []), p.footnotes, p.endnotes]).tabel;
}

/**
 * Melding als een (ingebouwde) stijl zoals ‘Kop 3’ niet in het document staat:
 * de engine meldt dan alleen ‘ongeldige opties’. Null als de stijl bestaat of
 * de stijlen (nog) niet bekend zijn.
 */
export function ontbrekendeStijl(stijlen: StyleDefinitions | undefined, styleId: string): string | null {
  if (!stijlen?.styles.length || stijlen.styles.some((s) => s.styleId === styleId)) return null;
  const kop = /^Heading(\d)$/.exec(styleId);
  const naam = kop ? ingebouwd("heading", { level: kop[1] }) : stijlNaam({ styleId, name: styleId });
  return i18next.t("writer:styles.missingStyle", { name: naam });
}

type Knoop = { type?: string; content?: unknown; formatting?: { styleId?: string; numPr?: { numId?: number } }; rows?: unknown;
};

/** Hoe vaak elke stijl in de documentverhalen voorkomt (alinea-, teken- en tabelstijlen). */
export function gebruikteStijlen(document: Document | null | undefined): Map<string, number> {
  const telling = new Map<string, number>();
  const pakket = document?.package, defs = pakket?.styles;
  const lijstStijlen = new Map<number, Set<string>>();
  for (const stijl of defs?.styles ?? []) if (stijl.type === "numbering") {
    const id = opgelosteOpmaak(defs, stijl.styleId).p.numPr?.numId;
    if (id !== undefined && id !== 0) {
      if (!lijstStijlen.has(id)) lijstStijlen.set(id, new Set());
      lijstStijlen.get(id)!.add(stijl.styleId);
    }
  }
  for (const num of pakket?.numbering?.nums ?? []) {
    const abstract = pakket?.numbering?.abstractNums.find(
      (a) => a.abstractNumId === num.abstractNumId);
    for (const id of [abstract?.styleLink, abstract?.numStyleLink]) if (id && defs?.styles.some((s) => s.styleId === id && s.type === "numbering")) {
      if (!lijstStijlen.has(num.numId)) lijstStijlen.set(num.numId, new Set());
      lijstStijlen.get(num.numId)!.add(id);
    }
  }
  const alineaNummers = new Map<string, number | undefined>();
  const tel = (id: string | undefined) => {
    if (id) telling.set(id, (telling.get(id) ?? 0) + 1);
  };
  let budget = 200000;
  const loop = (knoop: unknown) => {
    if (budget-- <= 0 || !knoop || typeof knoop !== "object") return;
    if (Array.isArray(knoop)) {
      for (const k of knoop) loop(k);
      return;
    }
    const k = knoop as Knoop;
    if (k.type === "paragraph") {
      tel(k.formatting?.styleId ?? "\u0000standaard");
      const stijl = k.formatting?.styleId ?? "";
      if (!alineaNummers.has(stijl)) alineaNummers.set(stijl, opgelosteOpmaak(defs, stijl).p.numPr?.numId);
      const num = k.formatting?.numPr?.numId ?? alineaNummers.get(stijl);
      if (num !== undefined) for (const id of lijstStijlen.get(num) ?? []) tel(id);
    }
    else if (k.type === "run") tel(k.formatting?.styleId);
    else if (k.type === "table") tel((k.formatting as { styleId?: string } | undefined)?.styleId);
    if (k.content) loop(k.content);
    if (k.rows) loop(k.rows);
    const cellen = (k as { cells?: unknown }).cells;
    if (cellen) loop(cellen);
  };
  loop(document?.package.document.content);
  for (const verhalen of [pakket?.headers?.values(), pakket?.footers?.values()])
    for (const verhaal of verhalen ?? []) loop(verhaal.content);
  for (const verhalen of [pakket?.footnotes, pakket?.endnotes, pakket?.footnoteSeparators, pakket?.endnoteSeparators])
    loop(verhalen);
  // Alinea's zonder stijl gebruiken de standaard-alineastijl.
  const zonder = telling.get("\u0000standaard");
  if (zonder) {
    telling.delete("\u0000standaard");
    const standaard = document?.package.styles?.styles.find((s) => s.type === "paragraph" && s.default)?.styleId;
    if (standaard) telling.set(standaard, (telling.get(standaard) ?? 0) + zonder);
  }
  return telling;
}

const PT = (twip: number) => `${formatGetal(twip / 20, { maximumFractionDigits: 1 })} pt`;
const CM = (twip: number) => `${formatGetal(twip / 567, { maximumFractionDigits: 2 })} cm`;
const UITLIJNING: Record<string, string> = { left: "left", center: "center", right: "right", both: "justify" };

/** Leesbare beschrijving van directe (niet-stijl) opmaak, voor ‘Inspecteren’. */
export function beschrijfOpmaak(
  tekst: TextFormatting | undefined,
  alinea: ParagraphFormatting | undefined,
): { tekst: string[]; alinea: string[] } {
  const v = (sleutel: string, waarden?: Record<string, string>) => i18next.t(`writer:styles.inspect.${sleutel}`, waarden);
  const t: string[] = [];
  if (tekst) {
    if (tekst.fontFamily?.ascii || tekst.fontFamily?.asciiTheme)
      t.push(v("font", { value: tekst.fontFamily.ascii ?? tekst.fontFamily.asciiTheme ?? "" }));
    if (tekst.fontSize) t.push(v("size", { value: `${formatGetal(tekst.fontSize / 2)} pt` }));
    if (tekst.bold !== undefined) t.push(v(tekst.bold ? "bold" : "notBold"));
    if (tekst.italic !== undefined) t.push(v(tekst.italic ? "italic" : "notItalic"));
    if (tekst.underline)
      t.push(tekst.underline.style === "none" ? v("notUnderlined") : v("underlined", { style: tekst.underline.style }));
    if (tekst.strike) t.push(v("strikethrough"));
    if (tekst.doubleStrike) t.push(v("doubleStrikethrough"));
    if (tekst.vertAlign && tekst.vertAlign !== "baseline")
      t.push(v(tekst.vertAlign === "superscript" ? "superscript" : "subscript"));
    if (tekst.allCaps) t.push(v("allCaps"));
    if (tekst.smallCaps) t.push(v("smallCaps"));
    if (tekst.hidden) t.push(v("hidden"));
    if (tekst.color?.rgb || tekst.color?.themeColor)
      t.push(v("color", { value: tekst.color.rgb ? `#${tekst.color.rgb}` : (tekst.color.themeColor ?? ""),
        }));
    if (tekst.highlight && tekst.highlight !== "none") t.push(v("highlight", { value: tekst.highlight }));
    if (tekst.spacing) t.push(v("characterSpacing", { value: PT(tekst.spacing) }));
    if (tekst.language?.latin) t.push(v("language", { value: tekst.language.latin }));
    if (tekst.styleId) t.push(v("characterStyle", { value: tekst.styleId }));
  }
  const a: string[] = [];
  if (alinea) {
    if (alinea.alignment) {
      const sleutel = UITLIJNING[alinea.alignment as string];
      a.push(v("alignment", { value: sleutel ? v(`alignmentValue.${sleutel}`) : String(alinea.alignment) }));
    }
    if (alinea.spaceBefore !== undefined) a.push(v("spaceBefore", { value: PT(alinea.spaceBefore) }));
    if (alinea.spaceAfter !== undefined) a.push(v("spaceAfter", { value: PT(alinea.spaceAfter) }));
    if (alinea.lineSpacing !== undefined)
      a.push(
        !alinea.lineSpacingRule || alinea.lineSpacingRule === "auto"
          ? v("lineSpacing", { value: formatGetal(alinea.lineSpacing / 240, { maximumFractionDigits: 2 }) })
          : v(alinea.lineSpacingRule === "exact" ? "lineSpacingExactly" : "lineSpacingAtLeast", { value: PT(alinea.lineSpacing) }),
      );
    if (alinea.indentLeft) a.push(v("indentLeft", { value: CM(alinea.indentLeft) }));
    if (alinea.indentRight) a.push(v("indentRight", { value: CM(alinea.indentRight) }));
    if (alinea.indentFirstLine)
      a.push(v(alinea.hangingIndent ? "hanging" : "firstLine", { value: CM(alinea.indentFirstLine) }));
    if (alinea.keepNext) a.push(v("keepWithNext"));
    if (alinea.keepLines) a.push(v("keepLinesTogether"));
    if (alinea.pageBreakBefore) a.push(v("pageBreakBefore"));
  }
  return { tekst: t, alinea: a };
}

/** De alinea (en zijn runs) met deze paraId in de hoofdtekst. */
export function vindAlinea(document: Document | null | undefined, paraId: string | null | undefined) {
  if (!document || !paraId) return null;
  // De engine noemt alinea's in de hoofdtekst ‘body:pN’: de N-de alinea op
  // het hoogste niveau (tabellen tellen niet mee).
  const engine = /^body:p(\d+)$/.exec(paraId);
  if (engine) {
    const alineas = document.package.document.content.filter((b) => b.type === "paragraph");
    return (
      (alineas[Number(engine[1])] as unknown as { formatting?: ParagraphFormatting; content: unknown[];
      }) ?? null
    );
  }
  let gevonden: { formatting?: ParagraphFormatting; content: unknown[];
  } | null = null;
  let budget = 200000;
  const loop = (knoop: unknown) => {
    if (gevonden || budget-- <= 0 || !knoop || typeof knoop !== "object") return;
    if (Array.isArray(knoop)) {
      for (const k of knoop) loop(k);
      return;
    }
    const k = knoop as Knoop & { paraId?: string; cells?: unknown };
    if (k.type === "paragraph" && k.paraId === paraId) {
      gevonden = k as unknown as { formatting?: ParagraphFormatting; content: unknown[];
      };
      return;
    }
    if (k.content) loop(k.content);
    if (k.rows) loop(k.rows);
    if (k.cells) loop(k.cells);
  };
  loop(document.package.document.content);
  return gevonden as { formatting?: ParagraphFormatting; content: unknown[];
  } | null;
}

/** De run waarin tekenpositie `positie` (vanaf het begin van de alinea) valt. */
export function runOpPositie(inhoud: unknown[], positie: number): TextFormatting | null {
  let teller = 0;
  let laatste: TextFormatting | null = null;
  let gevonden: TextFormatting | null = null;
  const loop = (knopen: unknown[]) => {
    for (const k of knopen as (Knoop & { text?: string })[]) {
      if (gevonden) return;
      if (k?.type === "run") {
        const formatting = (k.formatting ?? {}) as TextFormatting;
        let lengte = 0;
        for (const deel of (k.content ?? []) as { type?: string; text?: string;
        }[])
          lengte += deel.type === "text" ? (deel.text ?? "").length : deel.type === "tab" ? 1 : 0;
        if (lengte === 0) continue;
        laatste = formatting;
        if (positie < teller + lengte) gevonden = formatting;
        teller += lengte;
      } else if (k?.type !== "deletion" && Array.isArray(k?.content)) loop(k.content as unknown[]);
    }
  };
  loop(inhoud);
  return gevonden ?? laatste;
}

/** De directe opmaak van een alinea: alinea-eigenschappen zonder stijl, en die van de runs. */
export function directeOpmaak(document: Document | null | undefined, paraId: string | null | undefined) {
  const alinea = vindAlinea(document, paraId);
  if (!alinea) return null;
  const { styleId, ...eigen } = (alinea.formatting ?? {}) as ParagraphFormatting & { styleId?: string };
  // Interne velden van de engine horen niet bij de zichtbare opmaak.
  for (const sleutel of ["spacingExplicit", "numPr", "runProperties", "rPr", "outlineLevel"] as const)
    delete (eigen as Record<string, unknown>)[sleutel];
  const runs: TextFormatting[] = [];
  const loop = (knopen: unknown[]) => {
    for (const k of knopen as Knoop[]) {
      if (k?.type === "run" && k.formatting) runs.push(k.formatting as TextFormatting);
      else if (Array.isArray(k?.content)) loop(k.content as unknown[]);
    }
  };
  loop(alinea.content ?? []);
  return { styleId, alinea: eigen as ParagraphFormatting, runs };
}
