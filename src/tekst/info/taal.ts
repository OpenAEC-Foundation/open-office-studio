/** Taal van de tekst op de cursor en taalnamen in de interfacetaal. */
import type { Document, TextFormatting } from "@betteroffice/docx/types/document";
import { intlLocale } from "../../i18n/config";
import { runOpPositie, vindAlinea } from "../stijlen/model";

export const TALEN = [
  "nl-NL", "nl-BE", "en-GB", "en-US", "de-DE", "fr-FR", "fr-BE", "es-ES",
  "it-IT", "pt-PT", "da-DK", "sv-SE", "nb-NO", "fi-FI", "pl-PL", "tr-TR",
] as const;

const namen = new Map<string, Intl.DisplayNames | null>();
/**
 * Naam van een taal in de interfacetaal (of in `locale`), zoals
 * "Nederlands (Nederland)" voor nl-NL in het Nederlands of "Dutch
 * (Netherlands)" in het Engels.
 */
export function taalNaam(code: string, locale: string = intlLocale()): string {
  let notatie = namen.get(locale);
  if (notatie === undefined) {
    try {
      // `standard`: Intl noemt nl-BE anders ‘Vlaams’; tekstverwerkers tonen
      // ‘Nederlands (België)’.
      notatie = new Intl.DisplayNames([locale], { type: "language", languageDisplay: "standard" });
    } catch {
      notatie = null;
    }
    namen.set(locale, notatie);
  }
  try {
    const naam = notatie?.of(code);
    if (naam) return naam.charAt(0).toLocaleUpperCase(locale) + naam.slice(1);
  } catch {
    // Onbekende code: de code zelf.
  }
  return code;
}

/**
 * De taal op de cursor: run → alineastijl (met basisstijlen) →
 * documentstandaard. Null als het document geen taal noemt.
 */
export function taalOpCursor(
  document: Document | null | undefined,
  paraId: string | null | undefined,
  positie: number,
): string | null {
  if (!document) return null;
  const stijlen = document.package.styles;
  const alinea = vindAlinea(document, paraId);
  const run = alinea ? runOpPositie(alinea.content, positie) : null;
  if (run?.language?.latin) return run.language.latin;
  const bekend = new Map((stijlen?.styles ?? []).map((s) => [s.styleId, s]));
  const kandidaten: (string | undefined)[] = [run?.styleId];
  const styleId = (alinea?.formatting as { styleId?: string } | undefined)?.styleId ??
    stijlen?.styles.find((s) => s.type === "paragraph" && s.default)?.styleId;
  kandidaten.push(styleId);
  for (const begin of kandidaten) {
    for (let s = begin ? bekend.get(begin) : undefined, n = 0; s && n < 50; n++) {
      const taal = (s.rPr as TextFormatting | undefined)?.language?.latin;
      if (taal) return taal;
      s = s.basedOn ? bekend.get(s.basedOn) : undefined;
    }
  }
  return stijlen?.docDefaults?.rPr?.language?.latin ?? null;
}
