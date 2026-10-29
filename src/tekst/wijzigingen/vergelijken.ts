/**
 * Versies vergelijken (#57) met `compareDocx` van de engine: het origineel
 * met de verschillen in de lopende tekst als bijgehouden wijzigingen van één
 * auteur. De engine weigert documenten die al wijzigingen bevatten; die kunnen
 * we voor de vergelijking eerst laten accepteren (in een kopie).
 */
import type { DocxCompareDiagnostic, DocxComparedChange } from "@betteroffice/docx";
import { strFromU8, unzipSync } from "fflate";
import i18next from "../../i18n/config";
import { voorbeeld } from "./opdrachten.ts";

export interface VergelijkOpties {
  auteur: string;
  korrel: "word" | "char";
  /** Bestaande wijzigingen in beide documenten eerst accepteren (alleen in de kopie). */
  eerstAccepteren: boolean;
  datum?: Date;
}

export type Vergelijking =
  | { ok: true; bytes: Uint8Array; wijzigingen: DocxComparedChange[]; meldingen: DocxCompareDiagnostic[]; verschillen: number }
  | { ok: false; meldingen: DocxCompareDiagnostic[] };

/** Of het hoofddocument van een DOCX bijgehouden wijzigingen bevat. */
export function heeftWijzigingen(bytes: Uint8Array) {
  try {
    const pakket = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
    const xml = pakket["word/document.xml"];
    return !!xml && /<w:(ins|del|moveFrom|moveTo)\b/.test(strFromU8(xml));
  } catch {
    return false;
  }
}

export async function vergelijk(origineel: Uint8Array, gewijzigd: Uint8Array, opties: VergelijkOpties): Promise<Vergelijking> {
  let a = origineel,
    b = gewijzigd;
  if (opties.eerstAccepteren) {
    if (heeftWijzigingen(a)) a = (await voorbeeld(a, "accepteren")).bytes;
    if (heeftWijzigingen(b)) b = (await voorbeeld(b, "accepteren")).bytes;
  }
  const auteur = opties.auteur.trim().replace(/[\u0000-\u001f]/g, "") || i18next.t("writer:changes.compare.defaultAuthor");
  // Pas bij gebruik laden: de vergelijking hoort niet in de opstartbundel.
  const { compareDocx } = await import("@betteroffice/docx");
  const uit = await compareDocx(a, b, {
    author: auteur,
    date: (opties.datum ?? new Date()).toISOString(),
    granularity: opties.korrel,
    unsupported: "report",
  });
  if (!uit.ok) return { ok: false, meldingen: uit.diagnostics };
  return { ok: true, bytes: uit.docx, wijzigingen: uit.changes, meldingen: uit.diagnostics, verschillen: uit.changes.length };
}

/** Engine-meldingen met een eigen uitleg (`writer:changes.compare.diagnostics.<sleutel>`). */
const UITLEG: Partial<Record<DocxCompareDiagnostic["code"], string>> = {
  "invalid-options": "invalidOptions",
  "invalid-docx": "invalidDocx",
  "existing-revisions": "existingRevisions",
  "paragraph-insertion": "paragraphInsertion",
  "paragraph-deletion": "paragraphDeletion",
  "paragraph-move": "paragraphMove",
  "ambiguous-alignment": "ambiguousAlignment",
  "table-change": "tableChange",
  "structure-change": "structureChange",
  "field-change": "fieldChange",
  "object-change": "objectChange",
  "content-control-change": "contentControlChange",
  "formatting-change": "formattingChange",
  "unsupported-content": "unsupportedContent",
  "unsupported-formatting": "unsupportedFormatting",
  "out-of-scope-change": "outOfScopeChange",
  "opaque-part-change": "opaquePartChange",
  "metadata-difference": "metadataDifference",
  "limit-exceeded": "limitExceeded",
  "diagnostics-truncated": "diagnosticsTruncated",
  "batch-refused": "batchRefused",
  "serialization-failed": "serializationFailed",
  "roundtrip-mismatch": "roundtripMismatch",
};

/** Uitleg in de interfacetaal bij een melding van de engine, met het aantal keer. */
export function meldingen(lijst: readonly DocxCompareDiagnostic[]) {
  const per = new Map<string, { tekst: string; ernst: DocxCompareDiagnostic["severity"]; aantal: number }>();
  for (const d of lijst) {
    const sleutel = UITLEG[d.code];
    const tekst = sleutel ? i18next.t(`writer:changes.compare.diagnostics.${sleutel}`) : d.message;
    const oud = per.get(d.code);
    if (oud) oud.aantal++;
    else per.set(d.code, { tekst, ernst: d.severity, aantal: 1 });
  }
  const volgorde = { error: 0, warning: 1, info: 2 };
  return [...per.values()].sort((a, b) => volgorde[a.ernst] - volgorde[b.ernst]);
}

/** Korte omschrijving van één verschil: ‘oud’ → ‘nieuw’. */
export function verschilTekst(w: DocxComparedChange) {
  const soort = (s: "inserted" | "deleted" | "replaced") => i18next.t(`writer:changes.compare.kinds.${s}`);
  if (w.kind === "insertion") return { soort: soort("inserted"), oud: "", nieuw: w.revised.text };
  if (w.kind === "deletion") return { soort: soort("deleted"), oud: w.original.text, nieuw: "" };
  return { soort: soort("replaced"), oud: w.original.text, nieuw: w.revised.text };
}

/** Naam voor het resultaattabblad. */
export function resultaatNaam(origineel: string, gewijzigd: string) {
  const kaal = (n: string) => n.replace(/\.(docx|docm|dotx)$/i, "");
  const naam = i18next.t("writer:changes.compare.resultName", { original: kaal(origineel), revised: kaal(gewijzigd) });
  return `${naam}.docx`.replace(/[\\/:*?"<>|]/g, "-");
}
