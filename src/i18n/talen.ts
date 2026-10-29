/**
 * Talen van de interface (zie docs/i18n.md). Zuiver en zonder i18next, zodat
 * instellingen.ts en tests dit kunnen gebruiken zonder de vertalingen te laden.
 */

/** Ondersteunde interfacetalen (BCP-47), in de volgorde van de taalkeuze. */
export const TAALCODES = [
  "nl",
  "en",
  "de",
  "fr",
  "es",
  "it",
  "pt-BR",
  "pt-PT",
  "pl",
  "cs",
  "sk",
  "hu",
  "ro",
  "el",
  "sv",
  "da",
  "nb",
  "fi",
  "tr",
  "ru",
  "uk",
  "ar",
  "he",
  "hi",
  "id",
  "vi",
  "th",
  "zh-CN",
  "zh-TW",
  "ja",
  "ko",
] as const;
export type Taal = (typeof TAALCODES)[number];

/**
 * Talen die de app nu aanbiedt, laadt en controleert. De overige codes in
 * TAALCODES zijn voorbereid (deels vertaald) maar nog niet beschikbaar.
 */
export const INTERFACETALEN = ["nl", "en", "de", "fr", "es", "it", "pt-BR", "zh-CN"] as const satisfies readonly Taal[];
export const isInterfacetaal = (taal: Taal) => (INTERFACETALEN as readonly Taal[]).includes(taal);
/** Keuze in de instellingen: een vaste taal of "auto" (volgt de systeemtaal). */
export type TaalKeuze = "auto" | Taal;
export const TAALKEUZES: readonly TaalKeuze[] = ["auto", ...TAALCODES];

/** Brontaal: de teksten die de gebruiker tot nu toe zag; elke vertaling volgt deze sleutels. */
export const BRONTAAL: Taal = "nl";
/** Terugval als de systeemtaal niet wordt ondersteund, en voor ontbrekende sleutels. */
export const TERUGVALTAAL: Taal = "en";
/** Talen die in de startbundel zitten; de rest laadt per taal als eigen chunk. */
export const DIRECTE_TALEN: readonly Taal[] = ["nl", "en"];

/** Namen in de taal zelf (endoniemen); die vertaal je niet. */
export const TAALNAMEN: Record<Taal, string> = {
  nl: "Nederlands",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  "pt-BR": "Português (Brasil)",
  "pt-PT": "Português (Portugal)",
  pl: "Polski",
  cs: "Čeština",
  sk: "Slovenčina",
  hu: "Magyar",
  ro: "Română",
  el: "Ελληνικά",
  sv: "Svenska",
  da: "Dansk",
  nb: "Norsk bokmål",
  fi: "Suomi",
  tr: "Türkçe",
  ru: "Русский",
  uk: "Українська",
  ar: "العربية",
  he: "עברית",
  hi: "हिन्दी",
  id: "Bahasa Indonesia",
  vi: "Tiếng Việt",
  th: "ไทย",
  "zh-CN": "中文（简体）",
  "zh-TW": "中文（繁體）",
  ja: "日本語",
  ko: "한국어",
};

/** Talen die van rechts naar links lopen; de schil spiegelt dan (`<html dir="rtl">`). */
export const RTL_TALEN: readonly Taal[] = ["ar", "he"];
export const isRtl = (taal: Taal) => RTL_TALEN.includes(taal);

/**
 * Regio voor Intl (datum, getal). Engels krijgt en-GB (dag-maand-jaar,
 * 24-uursklok); Arabisch en Thai de gregoriaanse kalender.
 */
export const INTL_LOCALE: Record<Taal, string> = {
  nl: "nl-NL",
  en: "en-GB",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
  it: "it-IT",
  "pt-BR": "pt-BR",
  "pt-PT": "pt-PT",
  pl: "pl-PL",
  cs: "cs-CZ",
  sk: "sk-SK",
  hu: "hu-HU",
  ro: "ro-RO",
  el: "el-GR",
  sv: "sv-SE",
  da: "da-DK",
  nb: "nb-NO",
  fi: "fi-FI",
  tr: "tr-TR",
  ru: "ru-RU",
  uk: "uk-UA",
  ar: "ar-EG",
  he: "he-IL",
  hi: "hi-IN",
  id: "id-ID",
  vi: "vi-VN",
  th: "th-TH-u-ca-gregory",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  ja: "ja-JP",
  ko: "ko-KR",
};

export const isTaal = (waarde: unknown): waarde is Taal =>
  typeof waarde === "string" && (TAALCODES as readonly string[]).includes(waarde);

export const isTaalKeuze = (waarde: unknown): waarde is TaalKeuze =>
  waarde === "auto" || isTaal(waarde);

/** De systeemtalen van de browser of webview, voorkeur eerst. */
export function systeemTalen(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  const lijst = navigator.languages?.length ? navigator.languages : [navigator.language];
  return lijst.filter((t): t is string => typeof t === "string" && t.length > 0);
}

/** Oude of afwijkende hoofdtaalcodes. */
const ALIASSEN: Record<string, Taal> = { no: "nb", nn: "nb", iw: "he", in: "id" };

/**
 * Zoekt de ondersteunde taal bij één BCP-47-tag, of null. Eerst de volledige
 * tag (pt-BR, zh-TW), dan de hoofdtaal: pt → pt-BR (pt-PT en andere regio's →
 * pt-PT), zh-TW/zh-HK/zh-MO/zh-Hant → zh-TW, overig zh → zh-CN, nb/no/nn → nb.
 */
export function zoekTaal(tag: string): Taal | null {
  const delen = tag.replace(/_/g, "-").split("-").filter(Boolean);
  if (!delen.length) return null;
  const hoofd = delen[0].toLowerCase();
  const rest = delen.slice(1).map((d) => d.toLowerCase());
  const exact = TAALCODES.find((code) => code.toLowerCase() === [hoofd, ...rest].join("-"));
  if (exact) return exact;
  if (hoofd === "pt") {
    const regio = rest.find((d) => d.length === 2);
    return !regio || regio === "br" ? "pt-BR" : "pt-PT";
  }
  if (hoofd === "zh") {
    if (rest.includes("hant") || rest.some((d) => ["tw", "hk", "mo"].includes(d))) return "zh-TW";
    return "zh-CN";
  }
  const alias = ALIASSEN[hoofd];
  if (alias) return alias;
  return isTaal(hoofd) ? hoofd : null;
}

/**
 * Bepaalt de taal van de interface. Bij "auto" de eerste systeemtaal die we
 * ondersteunen (zie `zoekTaal`), anders Engels.
 */
export function bepaalTaal(keuze: TaalKeuze, systeem: readonly string[] = systeemTalen()): Taal {
  if (keuze !== "auto") return isInterfacetaal(keuze) ? keuze : TERUGVALTAAL;
  for (const tag of systeem) {
    const taal = zoekTaal(tag);
    if (taal && isInterfacetaal(taal)) return taal;
  }
  return TERUGVALTAAL;
}
