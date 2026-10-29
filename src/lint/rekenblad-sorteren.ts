/**
 * Sorteren met meerdere niveaus (#62): op waarde, cel- of tekstkleur of een
 * eigen lijst (dagen, maanden), met of zonder hoofdlettergevoeligheid en met
 * de sorteervolgorde (collator) van de interfacetaal. Puur.
 */
import type { XlsxCellValue } from "@betteroffice/xlsx";
import { intlLocale } from "../i18n/config";
import type { Bereik, Cel } from "./rekenblad-logica";
import { vasteLijsten } from "./rekenblad-reeks";

export type SorteerOp = "waarden" | "celkleur" | "tekstkleur";

export interface Sorteersleutel {
  /** Kolom binnen de rijen (0 = eerste kolom van het bereik). */
  kolom: number;
  aflopend: boolean;
  op: SorteerOp;
  /** Bij kleur: deze kleur bovenaan (of onderaan bij `aflopend`). */
  kleur?: string | null;
  /** Eigen volgorde: namen in kleine letters, zoals de lijsten voor reeksen. */
  lijst?: readonly string[] | null;
}

export interface SorteerOpties {
  hoofdlettergevoelig: boolean;
  /** Intl-locale; standaard de interfacetaal. */
  taal?: string;
  /** Per sleutel (zelfde volgorde) de kleur van elke rij, voor sorteren op kleur. */
  kleuren?: (readonly (string | null)[] | undefined)[];
}

const leeg = (w: XlsxCellValue | undefined) =>
  !w || w.kind === "empty" || (w.kind === "text" && w.value === "");

/** Volgorde zoals Excel: getallen, tekst, logisch, fouten; lege cellen altijd onderaan. */
function rang(w: XlsxCellValue) {
  return w.kind === "number" ? 0 : w.kind === "text" ? 1 : w.kind === "bool" ? 2 : 3;
}

const collators = new Map<string, Intl.Collator>();
export function sorteerCollator(taal: string, hoofdletters: boolean) {
  const sleutel = `${taal}|${hoofdletters}`;
  let c = collators.get(sleutel);
  if (!c) {
    c = new Intl.Collator(taal, hoofdletters
      ? { sensitivity: "variant", caseFirst: "lower" }
      : { sensitivity: "accent" });
    collators.set(sleutel, c);
  }
  return c;
}

function vergelijkWaarde(
  a: XlsxCellValue,
  b: XlsxCellValue,
  collator: Intl.Collator,
  lijst: readonly string[] | null | undefined,
) {
  if (lijst?.length) {
    const ia = a.kind === "text" ? lijst.indexOf(a.value.trim().toLocaleLowerCase()) : -1;
    const ib = b.kind === "text" ? lijst.indexOf(b.value.trim().toLocaleLowerCase()) : -1;
    if (ia >= 0 || ib >= 0) {
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    }
  }
  const r = rang(a) - rang(b);
  if (r) return r;
  if (a.kind === "number" && b.kind === "number") return a.value - b.value;
  if (a.kind === "bool" && b.kind === "bool") return Number(a.value) - Number(b.value);
  const ta = a.kind === "text" || a.kind === "error" ? a.value : "";
  const tb = b.kind === "text" || b.kind === "error" ? b.value : "";
  return collator.compare(ta, tb);
}

/** Nieuwe rijvolgorde (indices in `rijen`); stabiel. */
export function sorteerRijen(
  rijen: readonly (readonly XlsxCellValue[])[],
  sleutels: readonly Sorteersleutel[],
  opties: SorteerOpties,
): number[] {
  const collator = sorteerCollator(opties.taal ?? intlLocale(), opties.hoofdlettergevoelig);
  const indices = rijen.map((_, i) => i);
  return indices.sort((i, j) => {
    for (let s = 0; s < sleutels.length; s++) {
      const sleutel = sleutels[s];
      if (sleutel.op !== "waarden") {
        const kleuren = opties.kleuren?.[s];
        const ki = kleuren?.[i] === (sleutel.kleur ?? null) ? 0 : 1;
        const kj = kleuren?.[j] === (sleutel.kleur ?? null) ? 0 : 1;
        if (ki !== kj) return sleutel.aflopend ? kj - ki : ki - kj;
        continue;
      }
      const a = rijen[i][sleutel.kolom];
      const b = rijen[j][sleutel.kolom];
      const la = leeg(a);
      const lb = leeg(b);
      if (la || lb) {
        if (la !== lb) return la ? 1 : -1;
        continue;
      }
      const v = vergelijkWaarde(a!, b!, collator, sleutel.lijst);
      if (v) return sleutel.aflopend ? -v : v;
    }
    return i - j;
  });
}

/** Eigen sorteerlijsten: dag- en maandnamen in de interfacetaal, Nederlands en Engels. */
export function sorteerLijsten(locale = intlLocale()) {
  return vasteLijsten(locale).map((l) => l.namen);
}

/**
 * Of de eerste rij een kopregel lijkt: alleen tekst, met eronder getallen,
 * datums of logische waarden. Bij alleen tekst beslist de opmaak
 * (`opvallend`: de eerste rij is vet en de tweede niet), zoals in Excel.
 */
export function lijktKopregel(rijen: readonly (readonly XlsxCellValue[])[], opvallend = false) {
  if (rijen.length < 2) return false;
  const [kop, ...rest] = rijen;
  if (!kop.some((w) => !leeg(w)) || !kop.every((w) => leeg(w) || w.kind === "text")) return false;
  if (rest.some((r) => r.some((w) => !leeg(w) && w.kind !== "text"))) return true;
  return opvallend;
}

/**
 * Het aaneengesloten gebied rond een cel, zoals Ctrl+A of het snelsorteren in
 * Excel: uitbreiden zolang er een gevulde cel direct naast de rand ligt.
 */
export function huidigGebied(gevuld: (rij: number, kolom: number) => boolean, start: Cel, grens: Bereik): Bereik {
  const b: Bereik = { top: start.row, left: start.col, bottom: start.row, right: start.col };
  const rij = (r: number, van: number, tot: number) => {
    for (let c = Math.max(van, grens.left); c <= Math.min(tot, grens.right); c++) if (gevuld(r, c)) return true;
    return false;
  };
  const kolom = (c: number, van: number, tot: number) => {
    for (let r = Math.max(van, grens.top); r <= Math.min(tot, grens.bottom); r++) if (gevuld(r, c)) return true;
    return false;
  };
  for (let veranderd = true; veranderd; ) {
    veranderd = false;
    if (b.top > grens.top && rij(b.top - 1, b.left - 1, b.right + 1)) (b.top--, (veranderd = true));
    if (b.bottom < grens.bottom && rij(b.bottom + 1, b.left - 1, b.right + 1)) (b.bottom++, (veranderd = true));
    if (b.left > grens.left && kolom(b.left - 1, b.top - 1, b.bottom + 1)) (b.left--, (veranderd = true));
    if (b.right < grens.right && kolom(b.right + 1, b.top - 1, b.bottom + 1)) (b.right++, (veranderd = true));
  }
  return b;
}
