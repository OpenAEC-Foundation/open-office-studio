/**
 * Opmaakkwast: de toestand los van de engine.
 * Enkel klikken = één keer plakken, dubbelklikken = blijven plakken tot Esc
 * of nog een klik op de kwast. Ctrl+Shift+C / Ctrl+Alt+C neemt de opmaak
 * op zonder de kwast te activeren; Ctrl+Shift+V / Ctrl+Alt+V plakt hem.
 */
import type { YrsInlineFormatDelta } from "@betteroffice/docx/yrs";
import i18next from "../../i18n/config";

export type KwastModus = "uit" | "eenmalig" | "blijvend";

/** Wat de kwast opneemt: tekenopmaak, super/subscript en eventueel de alineastijl. */
export interface GekopieerdeOpmaak {
  delta: YrsInlineFormatDelta;
  positie: Positie | null;
  /** Alineastijl van de bron; alleen gezet als de bron een hele alinea omvatte. */
  stijl: string | null;
}

export interface KwastStaat {
  modus: KwastModus;
  /** Opgenomen opmaak; null zolang er niets is gekopieerd. */
  opmaak: GekopieerdeOpmaak | null;
}

export const kwastBegin: KwastStaat = { modus: "uit", opmaak: null };

export type KwastGebeurtenis =
  | { soort: "klik"; opmaak: GekopieerdeOpmaak }
  | { soort: "dubbelklik"; opmaak: GekopieerdeOpmaak }
  | { soort: "kopieer"; opmaak: GekopieerdeOpmaak }
  | { soort: "toegepast" }
  | { soort: "stop" };

export function kwastStap(staat: KwastStaat, g: KwastGebeurtenis): KwastStaat {
  switch (g.soort) {
    case "klik":
      // Nog een klik op een actieve kwast zet hem uit, zoals in Word.
      if (staat.modus !== "uit") return { ...staat, modus: "uit" };
      return { modus: "eenmalig", opmaak: g.opmaak };
    case "dubbelklik":
      return { modus: "blijvend", opmaak: g.opmaak };
    case "kopieer":
      return { modus: "uit", opmaak: g.opmaak };
    case "toegepast":
      return staat.modus === "eenmalig" ? { ...staat, modus: "uit" } : staat;
    case "stop":
      return staat.modus === "uit" ? staat : { ...staat, modus: "uit" };
  }
}

/** Tri-state uit de selectiecontext: alleen een eenduidige waarde telt. */
type TriState = boolean | "mixed";

/** Tekenopmaak zoals `YrsSession.selectionContext` hem geeft. */
export interface BronOpmaak {
  bold: TriState;
  italic: TriState;
  underline: TriState;
  strike: TriState;
  superscript: TriState;
  subscript: TriState;
  fontFamily: string | null;
  /** Halve punten (OOXML `w:sz`). */
  fontSize: number | null;
  color: string | null;
  highlight: string | null;
}

const RGB = /^[0-9a-f]{6}$/i;

/**
 * Zet de opmaak van de bron om in een volledige delta: wat de bron niet heeft,
 * wordt bij het doel gewist (Word vervangt de tekenopmaak). Gemengde waarden
 * blijven bij het doel ongemoeid.
 */
export function opmaakUitBron(bron: BronOpmaak): YrsInlineFormatDelta {
  const delta: YrsInlineFormatDelta = {};
  const aanUit = (waarde: TriState) => (waarde === "mixed" ? undefined : waarde);
  const vet = aanUit(bron.bold);
  if (vet !== undefined) delta.bold = vet;
  const cursief = aanUit(bron.italic);
  if (cursief !== undefined) delta.italic = cursief;
  const onder = aanUit(bron.underline);
  if (onder !== undefined) delta.underline = onder;
  const door = aanUit(bron.strike);
  if (door !== undefined) delta.strike = door;
  if (bron.fontFamily)
    delta.fontFamily = { ascii: bron.fontFamily, hAnsi: bron.fontFamily };
  if (bron.fontSize) delta.fontSize = bron.fontSize / 2;
  if (bron.color)
    delta.color = RGB.test(bron.color)
      ? { rgb: bron.color.toUpperCase() }
      : { themeColor: bron.color };
  else delta.color = null;
  delta.highlight = bron.highlight && bron.highlight !== "none" ? bron.highlight : null;
  return delta;
}

export type Positie = "superscript" | "subscript" | "normaal";

/** Super- of subscript van de bron; null bij een gemengde bron. */
export function positieUitBron(bron: BronOpmaak): Positie | null {
  if (bron.superscript === "mixed" || bron.subscript === "mixed") return null;
  return bron.superscript ? "superscript" : bron.subscript ? "subscript" : "normaal";
}

/** Korte omschrijving voor de knopuitleg en de statusmelding. */
export function omschrijfOpmaak(delta: YrsInlineFormatDelta | null): string {
  const t = (sleutel: string, waarden?: Record<string, string>) =>
    i18next.t(`writer:editing.formatPainter.describe.${sleutel}`, waarden);
  if (!delta) return t("none");
  const delen: string[] = [];
  if (delta.fontFamily) delen.push(delta.fontFamily.ascii);
  if (delta.fontSize) delen.push(`${delta.fontSize} pt`);
  if (delta.bold) delen.push(t("bold"));
  if (delta.italic) delen.push(t("italic"));
  if (delta.underline) delen.push(t("underline"));
  if (delta.strike) delen.push(t("strike"));
  if (delta.color && "rgb" in delta.color && delta.color.rgb)
    delen.push(`#${delta.color.rgb}`);
  if (delta.highlight) delen.push(t("highlight", { color: String(delta.highlight) }));
  return delen.join(t("separator")) || t("default");
}
