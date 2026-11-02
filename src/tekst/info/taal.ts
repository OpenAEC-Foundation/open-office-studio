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

// Eén alinea lezen voorkomt dat de statusbalk bij iedere cursorbeweging
// het hele document met alle stijlgegevens opnieuw opbouwt.
const alineaEenheid = new WeakMap<object, { story: string; paraId: string; index: number }>();
export function taalUitSessie(sessie: import("@betteroffice/docx/yrs").YrsSession, bron: Document | null): string | null {
  const head = sessie.selection()?.head;
  if (!head) return taalOpCursor(bron, null, 0);
  const oud = alineaEenheid.get(sessie);
  let index = oud?.story === head.story && oud.paraId === head.paraId ? oud.index : -1;
  let delen = index >= 0 ? sessie.storySegmentUnits(head.story, [index])[0] : undefined;
  if (!delen?.some((d) => d.kind === "pilcrow" && d.paraId === head.paraId)) {
    index = sessie.paragraphSpans(head.story).findIndex((p) => p.paraId === head.paraId);
    if (index < 0) return taalOpCursor(bron, head.paraId, head.offset);
    alineaEenheid.set(sessie, { story: head.story, paraId: head.paraId, index });
    delen = sessie.storySegmentUnits(head.story, [index])[0] ?? [];
  }
  const taal = (v: unknown) => v && typeof v === "object" && typeof (v as { latin?: unknown }).latin === "string" ? (v as { latin: string }).latin : null;
  let positie = 0;
  for (const d of delen) {
    if (d.kind === "text") {
      const eind = positie + d.text.length;
      if (head.offset <= eind) {
        const direct = taal(d.attributes.language);
        if (direct) return direct;
        break;
      }
      positie = eind;
    } else if (d.kind === "embed") positie++;
  }
  const pilcrow = delen.find((d) => d.kind === "pilcrow");
  const standaard = pilcrow?.kind === "pilcrow" ? pilcrow.properties.defaultTextFormatting as { language?: unknown } | undefined : undefined;
  return taal(standaard?.language) ?? taalOpCursor(bron, head.paraId, head.offset);
}
