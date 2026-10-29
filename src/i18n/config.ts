/**
 * Meertalige interface (OpenAEC-standaard, zie docs/i18n.md).
 *
 * - Vertalingen staan in `src/i18n/locales/<taal>/<namespace>.json` en worden
 *   hier automatisch opgepikt; een nieuwe namespace is alleen een nieuw
 *   JSON-bestand in elke taalmap.
 * - Nederlands (bron) en Engels (terugval) zitten in de startbundel; elke
 *   andere taal is een eigen chunk die pas bij het kiezen laadt.
 * - De taalkeuze staat in de instellingen (`taal`, src/instellingen.ts) en
 *   volgt daarmee vanzelf mee tussen vensters en tabbladen.
 * - In React: `useTranslation("<namespace>")`; daarbuiten `i18next.t("ns:sleutel")`.
 */
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { leesInstellingen, volgInstellingen } from "../instellingen";
import { meldDesktopTaal } from "./desktop";
import { zetUiLettertypen } from "./lettertypen";
import {
  bepaalTaal,
  BRONTAAL,
  DIRECTE_TALEN,
  INTERFACETALEN,
  INTL_LOCALE,
  isRtl,
  isTaal,
  TAALCODES,
  TAALNAMEN,
  TERUGVALTAAL,
  type Taal,
  type TaalKeuze,
} from "./talen";

export { TAALCODES, TAALNAMEN, TERUGVALTAAL, BRONTAAL, bepaalTaal, isRtl, type Taal, type TaalKeuze };

type Bundel = Record<string, unknown>;

const PAD = /\.\/locales\/([^/]+)\/([^/]+)\.json$/;
const direct = import.meta.glob<{ default: Bundel }>(
  ["./locales/nl/*.json", "./locales/en/*.json"],
  { eager: true },
);
// Alleen de aangeboden talen (INTERFACETALEN in talen.ts); voorbereide talen komen niet in de bundel.
const lui = import.meta.glob<{ default: Bundel }>(["./locales/{de,fr,es,it,pt-BR,zh-CN}/*.json"]);

/** Vertalingen die al geladen zijn, per taal en namespace. */
const resources: Record<string, Record<string, Bundel>> = {};
for (const [pad, module] of Object.entries(direct)) {
  const [, taal, ns] = PAD.exec(pad) ?? [];
  if (taal && ns) (resources[taal] ??= {})[ns] = module.default;
}

/** Namespaces die bestaan (in de brontaal Nederlands). */
export const NAMESPACES = Object.keys(resources[BRONTAAL] ?? {}).sort();

const geladen = new Set<string>(DIRECTE_TALEN);
const bezig = new Map<Taal, Promise<void>>();

/** Laadt de vertalingen van een taal (eigen chunk) en voegt ze toe aan i18next. */
export function laadTaal(taal: Taal): Promise<void> {
  if (geladen.has(taal)) return Promise.resolve();
  let belofte = bezig.get(taal);
  if (!belofte) {
    const bestanden = Object.entries(lui).filter(([pad]) => PAD.exec(pad)?.[1] === taal);
    belofte = Promise.all(
      bestanden.map(async ([pad, laad]) => {
        const ns = PAD.exec(pad)![2];
        i18next.addResourceBundle(taal, ns, (await laad()).default, true, true);
      }),
    )
      .then(() => {
        geladen.add(taal);
      })
      .catch((fout) => {
        console.warn(`Vertalingen voor ${taal} niet geladen; Engels gebruikt.`, fout);
      })
      .finally(() => bezig.delete(taal));
    bezig.set(taal, belofte);
  }
  return belofte;
}

/** Keuzelijst voor de instellingen: "auto" eerst, daarna de talen in hun eigen naam. */
export const TALEN: readonly { code: TaalKeuze; naam: string }[] = [
  { code: "auto", naam: "" },
  ...INTERFACETALEN.map((code) => ({ code, naam: TAALNAMEN[code] })),
];

function zetDocumentTaal(taal: string) {
  if (typeof document === "undefined") return;
  const t: Taal = isTaal(taal) ? taal : TERUGVALTAAL;
  document.documentElement.lang = t;
  document.documentElement.dir = isRtl(t) ? "rtl" : "ltr";
  zetUiLettertypen(t);
  meldDesktopTaal(t);
}

const startTaal = bepaalTaal(leesInstellingen().taal);

void i18next.use(initReactI18next).init({
  resources,
  // Een lui geladen taal komt na het laden; tot dan Engels (zie `gereed`).
  lng: geladen.has(startTaal) ? startTaal : TERUGVALTAAL,
  fallbackLng: TERUGVALTAAL,
  supportedLngs: [...INTERFACETALEN],
  load: "currentOnly",
  ns: NAMESPACES,
  defaultNS: "common",
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
  // Tijdens ontwikkelen meteen zien welke sleutel ontbreekt.
  saveMissing: import.meta.env?.DEV === true,
  missingKeyHandler: (talen, ns, sleutel) =>
    console.warn(`[i18n] ontbrekende sleutel ${ns}:${sleutel} (${talen.join(", ")})`),
});

i18next.on("languageChanged", zetDocumentTaal);
zetDocumentTaal(i18next.language);

/** De taal die nu getoond wordt (nooit "auto"). */
export function huidigeTaal(): Taal {
  const taal = i18next.language;
  return isTaal(taal) ? taal : TERUGVALTAAL;
}

/** Regio-tag voor Intl bij de huidige (of gegeven) taal, bijvoorbeeld "nl-NL". */
export function intlLocale(taal: Taal = huidigeTaal()): string {
  return INTL_LOCALE[taal];
}

let laatsteVerzoek = 0;
/**
 * Schakelt naar een taalkeuze (laadt de taal zo nodig eerst). Normaal niet
 * nodig: de instellingen sturen de taal. Handig in tests.
 */
export async function zetTaal(keuze: TaalKeuze): Promise<void> {
  const taal = bepaalTaal(keuze);
  const verzoek = ++laatsteVerzoek;
  await laadTaal(taal);
  // Snel achter elkaar kiezen: alleen de laatste keuze telt.
  if (verzoek !== laatsteVerzoek) return;
  if (taal !== i18next.language) await i18next.changeLanguage(taal);
}

/** Klaar als de begintaal geladen is; render de app pas daarna (main.tsx). */
export const gereed: Promise<void> = zetTaal(leesInstellingen().taal);

// De instellingen (ook een voorbeeld en wijzigingen uit andere vensters)
// bepalen de taal; bij "auto" volgt een gewijzigde systeemtaal.
const volg = () => void zetTaal(leesInstellingen().taal);
volgInstellingen(volg);
if (typeof window !== "undefined") window.addEventListener("languagechange", volg);

export default i18next;
