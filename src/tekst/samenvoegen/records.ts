import type { Gegevens } from "./gegevens";
export interface RecordKeuze { filterKolom: string; filter: string; vergelijking: "contains" | "equals" | "notEquals" | "empty" | "notEmpty"; sorteerKolom: string; aflopend: boolean; uitgesloten?: ReadonlySet<number> }
export function kiesRecords(data: Gegevens, keuze: RecordKeuze, locale = "nl-NL"): number[] {
  const col = data.kolommen.indexOf(keuze.filterKolom), sort = data.kolommen.indexOf(keuze.sorteerKolom);
  const normal = (s: string) => s.normalize("NFC").toLocaleLowerCase(locale), query = normal(keuze.filter);
  const ids = data.records.flatMap((row, i) => {
    if (keuze.uitgesloten?.has(i)) return [];
    if (col < 0) return [i];
    const value = normal(row[col]), ok = keuze.vergelijking === "empty" ? !value.trim() : keuze.vergelijking === "notEmpty" ? !!value.trim() : keuze.vergelijking === "equals" ? value === query : keuze.vergelijking === "notEquals" ? value !== query : value.includes(query);
    return ok ? [i] : [];
  });
  if (sort >= 0) { const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true }); ids.sort((a, b) => (keuze.aflopend ? -1 : 1) * collator.compare(data.records[a][sort], data.records[b][sort]) || a - b); }
  return ids;
}
