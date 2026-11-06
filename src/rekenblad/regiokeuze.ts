/** Bekende bestandsregio’s en de eigen instellingsnaam. */
export const REGIONAAM = "_OpenAEC_NumberLocale";
export const WERKMAPREGIOS = [
  "nl-NL",
  "en-GB",
  "en-US",
  "de-DE",
  "fr-FR",
  "es-ES",
  "it-IT",
  "pt-BR",
  "zh-CN",
  "lo-LA",
] as const;
export type Werkmapregio = (typeof WERKMAPREGIOS)[number];
export const isRegioNaam = (naam: string) =>
  naam.toLowerCase() === REGIONAAM.toLowerCase();
export function herkenRegio(waarde: string): Werkmapregio | null {
  const sleutel = waarde.replaceAll("_", "-").toLowerCase();
  return WERKMAPREGIOS.find((r) => r.toLowerCase() === sleutel) ?? null;
}
