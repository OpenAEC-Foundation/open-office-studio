/**
 * Bijgehouden wijzigingen (#28): soorten, auteurs, filteren en de vraag of
 * een wijziging in de selectie ligt. Los van de engine.
 */
import i18next from "../../i18n/config";
import { formatDatumTijd, vergelijkTekst } from "../../i18n/opmaak";

export interface Revisie {
  revisionId: string;
  author: string;
  date: string;
  kind: string;
  story: string;
  preview: string;
  range: { story: string; start: { paraId: string; offset: number }; end: { paraId: string; offset: number } };
}

/** Soorten met een eigen naam (`writer:changes.kinds.<soort>`). */
const SOORTEN = new Set(["insertion", "deletion", "pPrIns", "pPrDel", "pPrChange", "trIns", "trDel", "tableIns", "tableDel"]);
/** Weergavenaam van een revisiesoort in de interfacetaal. */
export const soortNaam = (kind: string) => i18next.t(`writer:changes.kinds.${SOORTEN.has(kind) ? kind : "other"}`);

export type Weergave = "alle" | "eenvoudig" | "geen" | "origineel";
/** Markeringsweergaven; naam en uitleg staan onder `writer:changes.views.<waarde>`. */
export const WEERGAVEN: readonly Weergave[] = ["alle", "eenvoudig", "geen", "origineel"];
export const weergaveNaam = (w: Weergave) => i18next.t(`writer:changes.views.${w}.name`);
export const weergaveUitleg = (w: Weergave) => i18next.t(`writer:changes.views.${w}.tip`);

/**
 * Auteurs met het aantal wijzigingen, op naam gesorteerd. Een revisie zonder
 * auteur telt onder de naam "" (de weergave toont dan ‘Onbekend’).
 */
export function auteurs(revisies: readonly Revisie[]) {
  const telling = new Map<string, number>();
  for (const r of revisies) telling.set(r.author || "", (telling.get(r.author || "") ?? 0) + 1);
  return [...telling].sort((a, b) => vergelijkTekst(a[0], b[0])).map(([naam, aantal]) => ({ naam, aantal }));
}

/** Revisies van de getoonde auteurs (een lege verborgen-set toont iedereen). */
export function getoond(revisies: readonly Revisie[], verborgen: ReadonlySet<string>) {
  return verborgen.size ? revisies.filter((r) => !verborgen.has(r.author || "")) : [...revisies];
}

/** Telt per soort, voor de samenvatting in het deelvenster. */
export function samenvatting(revisies: readonly Revisie[]) {
  const ingevoegd = revisies.filter((r) => /ins/i.test(r.kind) || r.kind === "insertion").length;
  const verwijderd = revisies.filter((r) => /del/i.test(r.kind) || r.kind === "deletion").length;
  const opmaak = revisies.length - ingevoegd - verwijderd;
  return { totaal: revisies.length, ingevoegd, verwijderd, opmaak };
}

export interface Plek {
  story: string;
  paraId: string;
  offset: number;
}

/**
 * Ligt (een deel van) een revisie in de selectie? `volgorde` geeft de index
 * van een alinea in zijn verhaal, zodat plekken over alinea's heen te
 * vergelijken zijn.
 */
export function inSelectie(r: Revisie, van: Plek, tot: Plek, volgorde: (story: string, paraId: string) => number) {
  if (r.range.story !== van.story) return false;
  const sleutel = (p: { paraId: string; offset: number }) => volgorde(r.range.story, p.paraId) * 1e6 + p.offset;
  const a = Math.min(sleutel(van), sleutel(tot)),
    b = Math.max(sleutel(van), sleutel(tot));
  const ra = sleutel(r.range.start),
    rb = sleutel(r.range.end);
  // Een lege selectie (cursor) telt als binnen als de cursor in de revisie staat.
  return a === b ? ra <= a && a <= rb : ra < b && rb > a;
}

/** Leesbare datum in de interfacetaal, zoals ‘12 okt. 2026, 14:05’. */
export function toonDatum(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatDatumTijd(d, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
