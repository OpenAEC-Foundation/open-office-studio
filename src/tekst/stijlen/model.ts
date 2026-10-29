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
  Theme,
} from "@betteroffice/docx/types/document";
import i18next from "../../i18n/config";
import { formatGetal } from "../../i18n/opmaak";
import type { StijlEigenschappen } from "./stijlenxml";

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
  soort: "paragraph" | "character" = "paragraph",
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
    if (tekst.strike !== undefined) e.doorgehaald = tekst.strike;
    if (tekst.allCaps !== undefined) e.hoofdletters = tekst.allCaps;
    if (tekst.smallCaps !== undefined) e.kleineHoofdletters = tekst.smallCaps;
    const kleur = themaKleur(tekst.color, thema);
    if (kleur) e.kleur = kleur.toUpperCase();
  }
  if (alinea && soort === "paragraph") {
    const a = alinea.alignment;
    if (a === "left" || a === "center" || a === "right" || a === "both") e.uitlijning = a;
    if (alinea.spaceBefore !== undefined) e.ruimteVoor = alinea.spaceBefore / 20;
    if (alinea.spaceAfter !== undefined) e.ruimteNa = alinea.spaceAfter / 20;
    if (alinea.lineSpacing !== undefined && (!alinea.lineSpacingRule || alinea.lineSpacingRule === "auto"))
      e.regelafstand = Math.round((alinea.lineSpacing / 240) * 100) / 100;
    if (alinea.indentLeft !== undefined) e.inspringLinks = Math.round((alinea.indentLeft / 567) * 100) / 100;
    if (alinea.indentFirstLine !== undefined)
      e.eersteRegel = Math.round(((alinea.hangingIndent ? -1 : 1) * alinea.indentFirstLine * 100) / 567) / 100;
  }
  return e;
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

type Knoop = { type?: string; content?: unknown; formatting?: { styleId?: string }; rows?: unknown };

/** Hoe vaak elke stijl in de hoofdtekst voorkomt (alinea- en tekenstijlen). */
export function gebruikteStijlen(document: Document | null | undefined): Map<string, number> {
  const telling = new Map<string, number>();
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
    if (k.type === "paragraph") tel(k.formatting?.styleId ?? "\u0000standaard");
    else if (k.type === "run") tel(k.formatting?.styleId);
    else if (k.type === "table") tel((k.formatting as { styleId?: string } | undefined)?.styleId);
    if (k.content) loop(k.content);
    if (k.rows) loop(k.rows);
    const cellen = (k as { cells?: unknown }).cells;
    if (cellen) loop(cellen);
  };
  loop(document?.package.document.content);
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
      t.push(v("color", { value: tekst.color.rgb ? `#${tekst.color.rgb}` : tekst.color.themeColor ?? "" }));
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
    return (alineas[Number(engine[1])] as unknown as { formatting?: ParagraphFormatting; content: unknown[] }) ?? null;
  }
  let gevonden: { formatting?: ParagraphFormatting; content: unknown[] } | null = null;
  let budget = 200000;
  const loop = (knoop: unknown) => {
    if (gevonden || budget-- <= 0 || !knoop || typeof knoop !== "object") return;
    if (Array.isArray(knoop)) {
      for (const k of knoop) loop(k);
      return;
    }
    const k = knoop as Knoop & { paraId?: string; cells?: unknown };
    if (k.type === "paragraph" && k.paraId === paraId) {
      gevonden = k as unknown as { formatting?: ParagraphFormatting; content: unknown[] };
      return;
    }
    if (k.content) loop(k.content);
    if (k.rows) loop(k.rows);
    if (k.cells) loop(k.cells);
  };
  loop(document.package.document.content);
  return gevonden as { formatting?: ParagraphFormatting; content: unknown[] } | null;
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
        for (const deel of (k.content ?? []) as { type?: string; text?: string }[])
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
