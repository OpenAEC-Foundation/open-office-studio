/**
 * Teksten van de paginafuncties buiten React (meldingen en standaardteksten
 * die in het document komen), in de interfacetaal op het moment van gebruik.
 *
 * Deze modules draaien ook zonder app (scripts/test-paginafuncties.mjs in
 * Node, zonder i18n-opzet): dan de Nederlandse brontekst uit het JSON-bestand.
 */
import i18next from "i18next";
import nl from "../../i18n/locales/nl/writer.json" with { type: "json" };

type Waarden = Record<string, string | number>;

/** Tekst bij `writer:page.<sleutel>`, met `{{variabelen}}`. */
export function paginaTekst(sleutel: string, waarden?: Waarden): string {
  if (i18next.isInitialized) return i18next.t(`writer:page.${sleutel}`, waarden ?? {});
  let tekst: unknown = (nl as Record<string, unknown>).page;
  for (const deel of sleutel.split(".")) tekst = (tekst as Record<string, unknown> | undefined)?.[deel];
  if (typeof tekst !== "string") return sleutel;
  return tekst.replace(/\{\{\s*(\w+)\s*\}\}/g, (geheel, naam: string) => (waarden && naam in waarden ? String(waarden[naam]) : geheel));
}

/**
 * Een tekst met plaatsen voor delen die geen tekst zijn (zoals velden), in de
 * woordvolgorde van de taal: "Pagina {{page}} van {{pages}}" → ["Pagina ",
 * {page}, " van ", {pages}].
 */
export function paginaTekstDelen(sleutel: string, namen: readonly string[]): (string | { plek: string })[] {
  const merk = (i: number) => `\u0001${i}\u0001`;
  const tekst = paginaTekst(sleutel, Object.fromEntries(namen.map((n, i) => [n, merk(i)])));
  return tekst
    .split(/(\u0001\d+\u0001)/)
    .filter(Boolean)
    .map((stuk) => {
      const m = /^\u0001(\d+)\u0001$/.exec(stuk);
      return m ? { plek: namen[Number(m[1])] } : stuk;
    });
}
