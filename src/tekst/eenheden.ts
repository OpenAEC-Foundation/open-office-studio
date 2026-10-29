/**
 * Omrekenen tussen wat de gebruiker ziet (cm, pt, regels) en de eenheden van
 * OOXML (twips, 240-sten van een regel, halve punten, achtste punten).
 */
import i18next from "../i18n/config";
import { formatGetal } from "../i18n/opmaak";

/** 1 inch = 1440 twips = 2,54 cm. */
export const TWIPS_PER_CM = 1440 / 2.54;
export const TWIPS_PER_PT = 20;

export const cmNaarTwips = (cm: number) => Math.round(cm * TWIPS_PER_CM);
export const twipsNaarCm = (twips: number) => twips / TWIPS_PER_CM;
export const ptNaarTwips = (pt: number) => Math.round(pt * TWIPS_PER_PT);
export const twipsNaarPt = (twips: number) => twips / TWIPS_PER_PT;
/** Lettergrootte en tekenpositie staan in halve punten. */
export const ptNaarHalvePunten = (pt: number) => Math.round(pt * 2);
export const halvePuntenNaarPt = (hp: number) => hp / 2;
/** Randdikte (`w:sz`) staat in achtste punten, van 2 tot 96. */
export const ptNaarAchtsten = (pt: number) => Math.min(96, Math.max(2, Math.round(pt * 8)));
export const achtstenNaarPt = (sz: number) => sz / 8;

/** Rondt af op een aantal decimalen zonder zwevendekommaruis. */
export function rond(waarde: number, decimalen = 2) {
  const f = 10 ** decimalen;
  return Math.round(waarde * f) / f;
}

/**
 * Getal in de notatie van de interfacetaal (nl: komma als decimaalteken),
 * zonder duizendtallen en zonder overbodige nullen.
 */
export function getalTekst(waarde: number, decimalen = 2) {
  return formatGetal(rond(waarde, decimalen), {
    maximumFractionDigits: decimalen,
    useGrouping: false,
  });
}

/**
 * Leest een getal zoals een gebruiker het typt: "1,5", "1.5", "2 cm", "-0,63".
 * Geeft `null` bij iets dat geen getal is.
 */
export function leesGetal(tekst: string): number | null {
  const schoon = tekst
    .trim()
    .replace(/\s*(cm|pt|mm|%|x|regels?)$/i, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(schoon)) return null;
  const n = Number(schoon);
  return Number.isFinite(n) ? n : null;
}

// --- Regelafstand ---------------------------------------------------------

export type Regelafstand =
  | { soort: "enkel" }
  | { soort: "anderhalf" }
  | { soort: "dubbel" }
  | { soort: "meerdere"; regels: number }
  | { soort: "minimaal"; pt: number }
  | { soort: "exact"; pt: number };

export type RegelSoort = Regelafstand["soort"];

const REGELSOORT_SLEUTEL: Record<RegelSoort, string> = {
  enkel: "single",
  anderhalf: "onePointFive",
  dubbel: "double",
  minimaal: "atLeast",
  exact: "exactly",
  meerdere: "multiple",
};

/** Weergavenaam van een regelafstandsoort in de interfacetaal. */
export const regelSoortNaam = (soort: RegelSoort) =>
  i18next.t(`writer:general.lineSpacing.${REGELSOORT_SLEUTEL[soort]}`);

/**
 * Weergavenamen per soort, in de volgorde van het venster. De waarden zijn
 * getters: ze worden bij elk lezen (tijdens het tekenen) vertaald.
 */
export const regelSoortNamen = Object.defineProperties(
  {} as Record<RegelSoort, string>,
  Object.fromEntries(
    (Object.keys(REGELSOORT_SLEUTEL) as RegelSoort[]).map((soort) => [
      soort,
      { enumerable: true, get: () => regelSoortNaam(soort) },
    ]),
  ),
);

/** OOXML: `w:line` met `w:lineRule` (auto = 240-sten van een regel, anders twips). */
export interface OoxmlRegelafstand {
  lineSpacing: number;
  lineSpacingRule: "auto" | "exact" | "atLeast";
}

export function regelafstandNaarOoxml(r: Regelafstand): OoxmlRegelafstand {
  switch (r.soort) {
    case "enkel":
      return { lineSpacing: 240, lineSpacingRule: "auto" };
    case "anderhalf":
      return { lineSpacing: 360, lineSpacingRule: "auto" };
    case "dubbel":
      return { lineSpacing: 480, lineSpacingRule: "auto" };
    case "meerdere":
      return { lineSpacing: Math.max(1, Math.round(r.regels * 240)), lineSpacingRule: "auto" };
    case "minimaal":
      return { lineSpacing: Math.max(0, ptNaarTwips(r.pt)), lineSpacingRule: "atLeast" };
    case "exact":
      return { lineSpacing: Math.max(1, ptNaarTwips(r.pt)), lineSpacingRule: "exact" };
  }
}

export function regelafstandUitOoxml(
  lineSpacing: number | null | undefined,
  rule: string | null | undefined,
): Regelafstand {
  if (lineSpacing == null || lineSpacing <= 0) return { soort: "enkel" };
  if (rule === "exact") return { soort: "exact", pt: rond(twipsNaarPt(lineSpacing), 1) };
  if (rule === "atLeast") return { soort: "minimaal", pt: rond(twipsNaarPt(lineSpacing), 1) };
  if (lineSpacing === 240) return { soort: "enkel" };
  if (lineSpacing === 360) return { soort: "anderhalf" };
  if (lineSpacing === 480) return { soort: "dubbel" };
  return { soort: "meerdere", regels: rond(lineSpacing / 240, 2) };
}

// --- Inspringen -----------------------------------------------------------

export type EersteRegel = "geen" | "eerste" | "verkeerd";

/**
 * Speciaal inspringen zoals Word het toont. OOXML kent `w:firstLine` en
 * `w:hanging` (beide positief); het model gebruikt `indentFirstLine` met
 * `hangingIndent` als vlag.
 */
export function eersteRegelUitOoxml(
  indentFirstLine: number | null | undefined,
  hangingIndent: boolean | null | undefined,
): { soort: EersteRegel; cm: number } {
  const waarde = indentFirstLine ?? 0;
  if (!waarde) return { soort: "geen", cm: 0 };
  const verkeerd = hangingIndent === true || waarde < 0;
  return { soort: verkeerd ? "verkeerd" : "eerste", cm: rond(twipsNaarCm(Math.abs(waarde))) };
}

export function eersteRegelNaarOoxml(soort: EersteRegel, cm: number) {
  if (soort === "geen" || cm <= 0) return { indentFirstLine: null, hangingIndent: false };
  return { indentFirstLine: cmNaarTwips(cm), hangingIndent: soort === "verkeerd" };
}

// --- Kleur ----------------------------------------------------------------

/** "#A1b2C3" of "a1b2c3" naar "A1B2C3"; `null` voor iets anders. */
export function hexKleur(kleur: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(kleur?.trim() ?? "");
  return m ? m[1].toUpperCase() : null;
}
