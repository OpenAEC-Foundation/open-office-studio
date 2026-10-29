/**
 * Talen van de spellingcontrole en de koppeling met OOXML-taalcodes
 * (`w:lang/@w:val`, bijvoorbeeld "nl-NL" of "en-GB").
 *
 * De worker importeert hier alleen typen; de vertaalde namen gebruikt alleen
 * de hoofdthread.
 */
import i18next, { intlLocale } from "../i18n/config";

export type TaalId = "nl" | "en-GB" | "en-US";
/** Een taal zonder woordenboek: niet controleren (zoals Word). */
export type Taal = TaalId | "geen";

/** De woordenboeken; de naam volgt de interfacetaal (zie `taalNaam`). */
export const TALEN: readonly { id: TaalId; kort: string }[] = [
  { id: "nl", kort: "NL" },
  { id: "en-GB", kort: "EN-GB" },
  { id: "en-US", kort: "EN-US" },
];

/**
 * Naam van een woordenboektaal in de interfacetaal, via Intl.DisplayNames
 * ("Engels (Verenigd Koninkrijk)", "English (United Kingdom)").
 */
export function taalNaam(taal: Taal): string {
  if (taal === "geen") return i18next.t("spelling:language.none");
  try {
    return (
      new Intl.DisplayNames([intlLocale()], { type: "language", languageDisplay: "standard" }).of(taal) ?? taal
    );
  } catch {
    return taal;
  }
}

/** Korte naam voor smalle plekken (taalknoppen in het rechtermuismenu). */
export function taalNaamKort(taal: Taal): string {
  if (taal === "en-GB") return i18next.t("spelling:language.short.enGB");
  if (taal === "en-US") return i18next.t("spelling:language.short.enUS");
  return taalNaam(taal);
}

export const taalKort = (taal: Taal) =>
  taal === "geen" ? "—" : (TALEN.find((t) => t.id === taal)?.kort ?? taal);

/**
 * Een OOXML/BCP-47-taalcode naar een woordenboek. Onbekende talen (Duits,
 * Frans, …) geven "geen"; een lege code geeft null (erven).
 */
export function taalUitCode(code: string | null | undefined): Taal | null {
  if (!code) return null;
  const c = code.trim().replace("_", "-").toLowerCase();
  if (!c) return null;
  if (c === "nl" || c.startsWith("nl-")) return "nl";
  if (c === "en-us" || c === "en-ca" || c === "en") return "en-US";
  if (c.startsWith("en-")) return "en-GB";
  // x-none en zxx ("geen taal") zijn in Word: niet controleren.
  return "geen";
}

/** Het woordenboek voor de taal van de gebruikersinterface/het systeem. */
export function standaardTaal(voorkeur?: readonly string[]): TaalId {
  const lijst = voorkeur ?? (typeof navigator !== "undefined" ? navigator.languages : []) ?? [];
  for (const code of lijst) {
    const taal = taalUitCode(code);
    if (taal && taal !== "geen") return taal;
  }
  return "nl";
}
