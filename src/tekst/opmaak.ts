/**
 * Alinea- en tekenopmaak via de Yrs-sessie van de tekstengine
 * (`@betteroffice/docx` 0.5.1). Zo blijven ongedaan maken, wijzigingen
 * bijhouden en samenwerking intact: elke wijziging is een gewone
 * sessiebewerking.
 *
 * De engine heeft hier een paar gaten die we omzeilen (zie de proef in
 * `scripts/test-tekstopmaak.mjs`):
 * - Bij opslaan schrijft de engine voor een alinea met eigen opmaak uit het
 *   bronbestand (`_originalFormatting`) alleen uitlijning, stijl en een paar
 *   vlaggen terug; inspringen, randen, arcering, tabs en "bij volgende
 *   houden" vallen weg. Voor een alinea zonder bronopmaak schrijft hij
 *   `keepNext`/`keepLines` nooit. Daarom zetten we `_originalFormatting` zelf
 *   op de nieuwe directe opmaak: die gaat dan ongewijzigd naar `w:pPr`.
 * - De getypte velden `tabs` en `hangingIndent` slaat de engine op in een
 *   vorm die het opslaan laat mislukken; die gaan via `other` in modelvorm.
 * - Een bijgehouden alineawijziging (`pPrChange`) krijgt een tekst-id, waarop
 *   het opslaan vastloopt; we zetten die om naar een getal.
 * - De onderstrepingskleur gaat alleen als object mee (via `other`).
 */
import type {
  YrsAuthor,
  YrsInlineFormatDelta,
  YrsParagraph,
  YrsParagraphAttrs,
  YrsSession,
  YrsStoryRange,
} from "@betteroffice/docx/yrs";

// --- Alinea ---------------------------------------------------------------

export type Uitlijning = "left" | "center" | "right" | "both";

export interface Rand {
  style: string;
  /** Achtste punten. */
  size?: number;
  /** Punten. */
  space?: number;
  color?: { rgb: string } | { auto: true };
}
export type RandZijde = "top" | "bottom" | "left" | "right" | "between";
export type Randen = Partial<Record<RandZijde, Rand>>;
export interface Arcering {
  fill?: { rgb: string };
  color?: { rgb: string };
  pattern?: string;
}
export interface Tabstop {
  /** Twips vanaf de linkermarge. */
  position: number;
  alignment: "left" | "center" | "right" | "decimal" | "bar" | "clear";
  leader?: "none" | "dot" | "hyphen" | "underscore" | "middleDot" | "heavy";
}

/**
 * Directe alineaopmaak in modelvorm (gelijk aan `ParagraphFormatting` van de
 * engine). `undefined` = ongewijzigd, `null` = wissen.
 */
export interface AlineaOpmaak {
  alignment?: Uitlijning | null;
  spaceBefore?: number | null;
  spaceAfter?: number | null;
  lineSpacing?: number | null;
  lineSpacingRule?: "auto" | "exact" | "atLeast" | null;
  indentLeft?: number | null;
  indentRight?: number | null;
  /** Altijd positief; `hangingIndent` bepaalt of het verkeerd-om is. */
  indentFirstLine?: number | null;
  hangingIndent?: boolean | null;
  tabs?: Tabstop[] | null;
  keepNext?: boolean | null;
  keepLines?: boolean | null;
  widowControl?: boolean | null;
  pageBreakBefore?: boolean | null;
  contextualSpacing?: boolean | null;
  borders?: Randen | null;
  shading?: Arcering | null;
  /** Lijstverwijzing (`w:numPr`); de definitie zelf staat in numbering.xml. */
  numPr?: { numId: number; ilvl: number } | null;
}

const GETYPT = [
  "alignment",
  "spaceBefore",
  "spaceAfter",
  "lineSpacing",
  "lineSpacingRule",
  "indentLeft",
  "indentRight",
  "indentFirstLine",
  "numPr",
] as const;
const PASSIEF = [
  "hangingIndent",
  "tabs",
  "keepNext",
  "keepLines",
  "widowControl",
  "pageBreakBefore",
  "contextualSpacing",
  "borders",
  "shading",
] as const;

type Velden = Record<string, unknown>;
const isObject = (w: unknown): w is Velden =>
  w !== null && typeof w === "object" && !Array.isArray(w);

/** De directe opmaak die de engine bij opslaan schrijft, plus de wijziging. */
export function nieuweDirecteOpmaak(huidig: Velden | null | undefined, wijziging: AlineaOpmaak): Velden {
  const uit: Velden = { ...(isObject(huidig) ? huidig : {}) };
  const expliciet: Velden = isObject(uit.spacingExplicit) ? { ...uit.spacingExplicit } : {};
  for (const [sleutel, waarde] of Object.entries(wijziging)) {
    if (waarde === undefined) continue;
    if (waarde === null) delete uit[sleutel];
    else uit[sleutel] = waarde;
    if (sleutel === "spaceBefore") expliciet.before = waarde !== null || undefined;
    if (sleutel === "spaceAfter") expliciet.after = waarde !== null || undefined;
  }
  if (wijziging.indentFirstLine === null) delete uit.hangingIndent;
  if (uit.hangingIndent === false) delete uit.hangingIndent;
  for (const k of Object.keys(expliciet)) if (expliciet[k] === undefined) delete expliciet[k];
  if (Object.keys(expliciet).length) uit.spacingExplicit = expliciet;
  else delete uit.spacingExplicit;
  return uit;
}

/** Zet een wijziging om naar het argument van `setParagraphAttrs`. */
export function alineaAttrs(huidig: Velden, wijziging: AlineaOpmaak): YrsParagraphAttrs {
  const attrs: Record<string, unknown> = {};
  const other: Record<string, unknown> = {};
  for (const sleutel of GETYPT) if (wijziging[sleutel] !== undefined) attrs[sleutel] = wijziging[sleutel];
  for (const sleutel of PASSIEF) if (wijziging[sleutel] !== undefined) other[sleutel] = wijziging[sleutel];
  if (wijziging.indentFirstLine === null && wijziging.hangingIndent === undefined) other.hangingIndent = false;
  other._originalFormatting = nieuweDirecteOpmaak(
    huidig._originalFormatting as Velden | undefined,
    wijziging,
  );
  return { ...(attrs as YrsParagraphAttrs), other };
}

/** Een stabiel positief getal voor een tekst-id van de engine (FNV-1a). */
export function numeriekId(id: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 2_000_000_000) + 1;
}

function herstelAlineawijzigingen(sessie: YrsSession, alinea: YrsParagraph) {
  const lijst = alinea.properties.pPrChange;
  if (!Array.isArray(lijst)) return;
  if (!lijst.some((c) => typeof c?.info?.id === "string")) return;
  sessie.setParagraphAttr(
    alinea.paraId,
    "pPrChange",
    lijst.map((c) =>
      typeof c?.info?.id === "string" ? { ...c, info: { ...c.info, id: numeriekId(c.info.id) } } : c,
    ),
  );
}

/** Voert bewerkingen uit als één stap voor ongedaan maken. */
export function alsEenStap<T>(sessie: YrsSession, doe: () => T): T {
  const modus = sessie.undoCaptureMode();
  sessie.addUndoBoundary();
  sessie.setUndoCaptureMode("manual");
  try {
    return doe();
  } finally {
    sessie.addUndoBoundary();
    sessie.setUndoCaptureMode(modus);
  }
}

const bereikVan = (story: string, paraId: string): YrsStoryRange => ({
  story,
  start: { paraId, offset: 0 },
  end: { paraId, offset: 0 },
});

/**
 * Past een alineawijziging toe op de opgegeven alinea's, als één
 * ongedaan-maakstap. Met `auteur` wordt het een bijgehouden wijziging.
 */
export function pasAlineasToe(
  sessie: YrsSession,
  story: string,
  paraIds: readonly string[],
  wijziging: AlineaOpmaak | ((alinea: YrsParagraph) => AlineaOpmaak),
  auteur?: YrsAuthor,
) {
  const alineas = new Map(sessie.paragraphs(story).map((a) => [a.paraId, a]));
  alsEenStap(sessie, () => {
    for (const paraId of paraIds) {
      const alinea = alineas.get(paraId);
      if (!alinea) continue;
      const w = typeof wijziging === "function" ? wijziging(alinea) : wijziging;
      sessie.setParagraphAttrs(bereikVan(story, paraId), alineaAttrs(alinea.properties, w), auteur);
      if (auteur) {
        const na = sessie.paragraphs(story).find((a) => a.paraId === paraId);
        if (na) herstelAlineawijzigingen(sessie, na);
      }
    }
  });
}

/** Directe plus overgeërfde alinea-eigenschappen zoals de engine ze toont. */
export function alineaEigenschappen(alinea: YrsParagraph | undefined): Velden {
  return alinea?.properties ?? {};
}

// --- Tekens ---------------------------------------------------------------

export type Onderstreping =
  | "single"
  | "words"
  | "double"
  | "thick"
  | "dotted"
  | "dash"
  | "dotDash"
  | "dotDotDash"
  | "wave"
  | "wavyDouble";

/** Tekenopmaak; `undefined` = ongewijzigd, `null` = wissen. */
export interface TekenOpmaak {
  fontFamily?: string | null;
  /** Punten. */
  fontSize?: number | null;
  bold?: boolean | null;
  italic?: boolean | null;
  /** RRGGBB. */
  color?: string | null;
  underline?: { style: Onderstreping; color?: string | null } | null;
  strike?: "enkel" | "dubbel" | null;
  vertAlign?: "superscript" | "subscript" | null;
  smallCaps?: boolean | null;
  allCaps?: boolean | null;
  hidden?: boolean | null;
  /** Tekenafstand in twips (positief = breder). */
  spacing?: number | null;
  /** Horizontale schaal in procenten. */
  scale?: number | null;
  /** Verhoogd/verlaagd in halve punten. */
  position?: number | null;
  /** Tekenspatiëring vanaf deze grootte in halve punten. */
  kerning?: number | null;
}

export interface TekenAfstand {
  spacing?: number;
  scale?: number;
  position?: number;
  kerning?: number;
}

/** Zet een tekenwijziging om naar het argument van `formatRange`. */
export function tekenDelta(w: TekenOpmaak, huidigeAfstand: TekenAfstand = {}): YrsInlineFormatDelta {
  const delta: YrsInlineFormatDelta = {};
  const other: Record<string, unknown> = {};
  if (w.fontFamily !== undefined)
    delta.fontFamily = w.fontFamily ? { ascii: w.fontFamily, hAnsi: w.fontFamily } : null;
  if (w.fontSize !== undefined) delta.fontSize = w.fontSize;
  if (w.bold !== undefined) delta.bold = w.bold || null;
  if (w.italic !== undefined) delta.italic = w.italic || null;
  if (w.color !== undefined) delta.color = w.color ? { rgb: w.color } : null;
  if (w.underline !== undefined) {
    if (!w.underline) delta.underline = null;
    else {
      // De kleur gaat alleen als object mee naar `w:u/@w:color`.
      other.underline = {
        style: w.underline.style,
        ...(w.underline.color ? { color: { rgb: w.underline.color } } : {}),
      };
    }
  }
  if (w.strike !== undefined)
    delta.strike = w.strike === "dubbel" ? { double: true } : w.strike === "enkel" ? true : null;
  if (w.vertAlign !== undefined) {
    other.superscript = w.vertAlign === "superscript" ? true : null;
    other.subscript = w.vertAlign === "subscript" ? true : null;
  }
  for (const sleutel of ["smallCaps", "allCaps", "hidden"] as const)
    if (w[sleutel] !== undefined) other[sleutel] = w[sleutel] ? true : null;
  const afstandSleutels = ["spacing", "scale", "position", "kerning"] as const;
  if (afstandSleutels.some((s) => w[s] !== undefined)) {
    const afstand: Record<string, number> = {};
    for (const s of afstandSleutels) {
      const waarde = w[s] === undefined ? huidigeAfstand[s] : w[s];
      if (waarde !== null && waarde !== undefined && !(s === "scale" && waarde === 100) && waarde !== 0)
        afstand[s] = waarde;
    }
    other.characterSpacing = Object.keys(afstand).length ? afstand : null;
  }
  if (Object.keys(other).length) delta.other = other;
  return delta;
}

/** Tekenopmaak zoals de dialoog die toont, gelezen uit run-attributen. */
export interface GelezenTekens {
  fontFamily: string | null;
  fontSize: number | null;
  bold: boolean;
  italic: boolean;
  color: string | null;
  underline: { style: string; color: string | null } | null;
  strike: "enkel" | "dubbel" | null;
  vertAlign: "superscript" | "subscript" | null;
  smallCaps: boolean;
  allCaps: boolean;
  hidden: boolean;
  afstand: TekenAfstand;
}

function rgbVan(w: unknown): string | null {
  if (typeof w === "string") return /^[0-9a-f]{6}$/i.test(w) ? w.toUpperCase() : null;
  if (isObject(w) && typeof w.rgb === "string" && /^[0-9a-f]{6}$/i.test(w.rgb)) return w.rgb.toUpperCase();
  return null;
}

/** Leest run-attributen (met de standaardopmaak van de alinea als terugval). */
export function leesTekens(attrs: Velden, standaard: Velden = {}): GelezenTekens {
  const familie = isObject(attrs.fontFamily)
    ? attrs.fontFamily
    : isObject(standaard.fontFamily)
      ? standaard.fontFamily
      : null;
  const grootte = isObject(attrs.fontSize)
    ? Number(attrs.fontSize.size)
    : typeof standaard.fontSize === "number"
      ? standaard.fontSize
      : NaN;
  const onder = isObject(attrs.underline) ? attrs.underline : attrs.underline === true ? { style: "single" } : null;
  const doorhalen = attrs.strike;
  const afstand = isObject(attrs.characterSpacing) ? attrs.characterSpacing : {};
  const getal = (w: unknown) => (typeof w === "number" && Number.isFinite(w) ? w : undefined);
  return {
    fontFamily: familie && typeof familie.ascii === "string" ? familie.ascii : null,
    fontSize: Number.isFinite(grootte) ? grootte / 2 : null,
    bold: attrs.bold === true,
    italic: attrs.italic === true,
    color: rgbVan(attrs.textColor),
    underline: onder ? { style: String(onder.style ?? "single"), color: rgbVan(onder.color) } : null,
    strike: isObject(doorhalen) && doorhalen.double ? "dubbel" : doorhalen ? "enkel" : null,
    vertAlign: attrs.superscript ? "superscript" : attrs.subscript ? "subscript" : null,
    smallCaps: attrs.smallCaps === true,
    allCaps: attrs.allCaps === true,
    hidden: attrs.hidden === true,
    afstand: {
      spacing: getal(afstand.spacing),
      scale: getal(afstand.scale),
      position: getal(afstand.position),
      kerning: getal(afstand.kerning),
    },
  };
}

/** Run-attributen op een positie in een alinea (het teken erna, of ervoor aan het eind). */
export function runAttributen(sessie: YrsSession, story: string, paraId: string, offset: number): Velden {
  const spans = sessie.paragraphSpans(story);
  const index = spans.findIndex((s) => s.paraId === paraId);
  if (index < 0) return {};
  const segmenten = sessie.storySegmentUnits(story, [index])[0] ?? [];
  let positie = 0;
  let vorige: Velden = {};
  for (const segment of segmenten) {
    if (segment.kind === "pilcrow") break;
    const lengte = segment.kind === "text" ? segment.text.length : 1;
    if (segment.kind === "text") {
      if (offset < positie + lengte || (offset === positie && lengte > 0)) return segment.attributes;
      vorige = segment.attributes;
    }
    positie += lengte;
  }
  return vorige;
}

export function pasTekensToe(sessie: YrsSession, bereik: YrsStoryRange, wijziging: TekenOpmaak, huidigeAfstand?: TekenAfstand) {
  const delta = tekenDelta(wijziging, huidigeAfstand);
  if (!Object.keys(delta).length) return;
  alsEenStap(sessie, () => sessie.formatRange(bereik, delta));
}
