/**
 * Datum, tijd, getallen en lijsten volgens de gekozen interfacetaal (Intl).
 * Gebruik deze in plaats van een vaste "nl-NL". Buiten React de functies
 * direct; in een component `useOpmaak()`, zodat een taalwissel opnieuw tekent.
 *
 * Meervoud in teksten loopt via i18next (`t("sleutel", { count })` met
 * `_one`/`_other` in de JSON); `meervoudVorm` is er voor de zeldzame gevallen
 * daarbuiten.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { huidigeTaal, intlLocale } from "./config";
import type { Taal } from "./talen";

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function getalNotatie(locale: string, opties?: Intl.NumberFormatOptions) {
  const sleutel = `g|${locale}|${JSON.stringify(opties ?? {})}`;
  let notatie = cache.get(sleutel) as Intl.NumberFormat | undefined;
  if (!notatie) cache.set(sleutel, (notatie = new Intl.NumberFormat(locale, opties)));
  return notatie;
}
function datumNotatie(locale: string, opties?: Intl.DateTimeFormatOptions) {
  const sleutel = `d|${locale}|${JSON.stringify(opties ?? {})}`;
  let notatie = cache.get(sleutel) as Intl.DateTimeFormat | undefined;
  if (!notatie) cache.set(sleutel, (notatie = new Intl.DateTimeFormat(locale, opties)));
  return notatie;
}
const alsDatum = (d: Date | number | string) => (d instanceof Date ? d : new Date(d));

/** Getal, bijvoorbeeld 1.234,5 (nl) of 1,234.5 (en). */
export function formatGetal(n: number, opties?: Intl.NumberFormatOptions, taal?: Taal) {
  return getalNotatie(intlLocale(taal), opties).format(n);
}

/** Percentage van een fractie: 0,25 → "25%". */
export function formatProcent(fractie: number, opties?: Intl.NumberFormatOptions, taal?: Taal) {
  return formatGetal(fractie, { style: "percent", ...opties }, taal);
}

/** Datum; standaard kort met maandnaam, bijvoorbeeld "28 okt 2026". */
export function formatDatum(
  d: Date | number | string,
  opties: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  taal?: Taal,
) {
  return datumNotatie(intlLocale(taal), opties).format(alsDatum(d));
}

/** Tijd in uren en minuten, bijvoorbeeld "14:05". */
export function formatTijd(
  d: Date | number | string,
  opties: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
  taal?: Taal,
) {
  return datumNotatie(intlLocale(taal), opties).format(alsDatum(d));
}

/** Datum en tijd samen, bijvoorbeeld "28 okt 2026, 14:05". */
export function formatDatumTijd(
  d: Date | number | string,
  opties: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
  taal?: Taal,
) {
  return datumNotatie(intlLocale(taal), opties).format(alsDatum(d));
}

/** Opsomming, bijvoorbeeld "a, b en c" (nl) of "a, b and c" (en). */
export function formatLijst(
  items: readonly string[],
  opties: Intl.ListFormatOptions = { type: "conjunction" },
  taal?: Taal,
) {
  return new Intl.ListFormat(intlLocale(taal), opties).format(items);
}

/** Bestandsgrootte in B, kB, MB of GB met het getalformaat van de taal. */
export function formatBytes(bytes: number, taal?: Taal) {
  const eenheden = ["B", "kB", "MB", "GB"];
  let waarde = bytes;
  let i = 0;
  while (waarde >= 1000 && i < eenheden.length - 1) {
    waarde /= 1000;
    i++;
  }
  return `${formatGetal(waarde, { maximumFractionDigits: i ? 1 : 0 }, taal)} ${eenheden[i]}`;
}

/** Meervoudscategorie volgens CLDR ("one", "other", …) voor de taal. */
export function meervoudVorm(n: number, taal?: Taal): Intl.LDMLPluralRule {
  return new Intl.PluralRules(intlLocale(taal)).select(n);
}

/** Tekstvergelijking voor sorteren volgens de taal (hoofdletterongevoelig). */
export function vergelijkTekst(a: string, b: string, taal?: Taal) {
  return a.localeCompare(b, intlLocale(taal), { sensitivity: "base", numeric: true });
}

/** Dezelfde functies, gebonden aan de taal van nu; tekent opnieuw bij een taalwissel. */
export function useOpmaak() {
  const { i18n } = useTranslation();
  const taal = (i18n.resolvedLanguage ?? i18n.language) as Taal;
  return useMemo(() => {
    const t = huidigeTaal();
    return {
      taal: t,
      locale: intlLocale(t),
      getal: (n: number, o?: Intl.NumberFormatOptions) => formatGetal(n, o, t),
      procent: (n: number, o?: Intl.NumberFormatOptions) => formatProcent(n, o, t),
      datum: (d: Date | number | string, o?: Intl.DateTimeFormatOptions) => formatDatum(d, o, t),
      tijd: (d: Date | number | string, o?: Intl.DateTimeFormatOptions) => formatTijd(d, o, t),
      datumTijd: (d: Date | number | string, o?: Intl.DateTimeFormatOptions) =>
        formatDatumTijd(d, o, t),
      lijst: (items: readonly string[], o?: Intl.ListFormatOptions) => formatLijst(items, o, t),
      bytes: (n: number) => formatBytes(n, t),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taal]);
}
