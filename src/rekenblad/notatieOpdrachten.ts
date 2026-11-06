/** Getalnotatie-opdrachten voor het lint (#64). */
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { leesWerkmapregio } from "./werkmapregio";
import { huidigeTaal } from "../i18n/config";
import { leesSelectie, Melding } from "../lint/rekenblad-opdrachten";
import { bouwCode, STANDAARD_KEUZES } from "./getalnotatie";

/** De gebruikelijke valuta bij de bestandsregio (of een oudere taalcode): € vóór (nl), € na (de, fr, es, it). */
export function standaardValuta(taal: string = huidigeTaal()) {
  if (taal === "en-GB") return "gbp";
  if (taal === "lo-LA") return "lak";
  if (taal === "nl-NL") return "eur";
  if (["de-DE", "fr-FR", "es-ES", "it-IT"].includes(taal)) return "eurNa";
  if (taal === "en-US") return "usd";
  if (taal === "nl") return "eur";
  if (["de", "fr", "es", "it", "pt-PT"].includes(taal)) return "eurNa";
  if (taal === "pt-BR") return "brl";
  if (taal === "zh-CN") return "cny";
  if (taal === "en") return "usd";
  return "eur";
}

/** Ctrl+Shift+4 en de knop Valuta: valutanotatie met twee decimalen. */
export async function valutaNotatie(api: XlsxEditorApi) {
  const { sheetId, bereik } = leesSelectie(api);
  const pattern = bouwCode("valuta", { ...STANDAARD_KEUZES, valuta: standaardValuta(leesWerkmapregio(api)) });
  const resultaat = await api.applyEdits({
    expectVersion: await api.version(),
    steps: [
      {
        op: "setNumberFormat",
        target: {
          sheetId,
          range: {
            kind: "rowCol",
            start: { row: bereik.top, col: bereik.left },
            end: { row: bereik.bottom, col: bereik.right },
          },
        },
        format: { type: "custom", pattern },
      },
    ],
  });
  if (!resultaat.ok) throw new Melding(resultaat.failure.message);
}
