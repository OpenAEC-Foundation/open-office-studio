/**
 * i18next in de workers van Database Studio en VBA (zie docs/i18n.md).
 *
 * Een worker heeft geen DOM en geen localStorage, dus geen instellingen: de
 * hoofdthread stuurt de gekozen taal mee (database-worker: bericht
 * `{ type: "taal" }`; VBA-worker: `opties.taal` bij de start). Alleen de
 * namespaces die in een worker nodig zijn worden geladen: `database`, `vba`
 * en `common`. Nederlands en Engels zitten in de worker; elke andere taal is
 * een eigen chunk die pas laadt als de hoofdthread die taal stuurt.
 *
 * Code die zowel in de hoofdthread als in een worker draait, importeert
 * `i18next` daarom rechtstreeks uit "i18next" (niet uit src/i18n/config): in
 * de hoofdthread heeft config.ts de instantie al ingesteld, in een worker doet
 * deze module dat. Alleen de ingang van een worker importeert dit bestand.
 */
import i18next from "i18next";
import { bepaalTaal, isTaal, isTaalKeuze, TERUGVALTAAL, type Taal } from "../../../src/i18n/talen";

type Bundel = Record<string, unknown>;

const PAD = /\/locales\/([^/]+)\/([^/]+)\.json$/;
const direct = import.meta.glob<{ default: Bundel }>(
  [
    "../../../src/i18n/locales/nl/{database,vba,common}.json",
    "../../../src/i18n/locales/en/{database,vba,common}.json",
  ],
  { eager: true },
);
const lui = import.meta.glob<{ default: Bundel }>([
  "../../../src/i18n/locales/*/{database,vba,common}.json",
  "!../../../src/i18n/locales/nl/*.json",
  "!../../../src/i18n/locales/en/*.json",
]);

const geladen = new Set<string>(["nl", "en"]);

if (!i18next.isInitialized) {
  const resources: Record<string, Record<string, Bundel>> = {};
  for (const [pad, module] of Object.entries(direct)) {
    const [, taal, ns] = PAD.exec(pad) ?? [];
    if (taal && ns) (resources[taal] ??= {})[ns] = module.default;
  }
  const begin = bepaalTaal("auto");
  void i18next.init({
    resources,
    lng: geladen.has(begin) ? begin : TERUGVALTAAL,
    fallbackLng: TERUGVALTAAL,
    load: "currentOnly",
    ns: ["database", "vba", "common"],
    defaultNS: "database",
    interpolation: { escapeValue: false },
    returnNull: false,
    initAsync: false,
  });
}

let bezig: Promise<void> = Promise.resolve();

/** Laadt zo nodig de vertalingen van `taal` en schakelt i18next in deze worker om. */
export function zetWorkerTaal(keuze: unknown): Promise<void> {
  const taal: Taal = isTaal(keuze) ? keuze : isTaalKeuze(keuze) ? bepaalTaal(keuze) : TERUGVALTAAL;
  bezig = bezig.then(async () => {
    if (!geladen.has(taal)) {
      const bestanden = Object.entries(lui).filter(([pad]) => PAD.exec(pad)?.[1] === taal);
      try {
        await Promise.all(
          bestanden.map(async ([pad, laad]) => {
            i18next.addResourceBundle(taal, PAD.exec(pad)![2], (await laad()).default, true, true);
          }),
        );
        geladen.add(taal);
      } catch {
        // Zonder de chunk blijft Engels gelden.
      }
    }
    if (i18next.language !== taal) await i18next.changeLanguage(geladen.has(taal) ? taal : TERUGVALTAAL);
  });
  return bezig;
}

/** Wacht tot een eerder gevraagde taalwissel klaar is (voor het afhandelen van een verzoek). */
export const workerTaalGereed = () => bezig;
