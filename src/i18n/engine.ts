/**
 * Vertalingen voor de editor-engines (@betteroffice/docx-react, xlsx-react,
 * pptx-react), per interfacetaal (zie ook docs/i18n.md):
 *
 * - nl: onze eigen bestanden (src/nederlands*.ts), in de startbundel;
 * - en: de standaard van de engine, in de startbundel;
 * - de, fr, pl, tr, he, hi, id, pt-BR, zh-CN: localepakketten van de engine
 *   (@betteroffice/*-i18n), lui geladen; pt-PT gebruikt voorlopig pt-BR;
 * - es: ons eigen bestand (src/i18n/engine/es.ts), lui geladen;
 * - overige talen: nog geen engine-vertaling, dus Engels (ENGINE_BRON = "terugval").
 *
 * Geef het resultaat door aan de prop `i18n` van de editor; de engines
 * schakelen dan live om zonder het document te herladen.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { en as tekstEn, type Translations as TekstVertaling } from "@betteroffice/docx-i18n";
import { en as rekenbladEn, type Translations as RekenbladVertaling } from "@betteroffice/xlsx-i18n";
import { en as diaEn, type Translations as DiaVertaling } from "@betteroffice/pptx-i18n";
import { tekstNlVolledig, rekenbladNlVolledig, diaNlVolledig } from "../nederlands-toegankelijk";
import { isTaal, TAALCODES, TERUGVALTAAL, type Taal } from "./talen";

export interface EngineVertaling {
  /** Voor DocxEditor (Tekst). */
  tekst: TekstVertaling;
  /** Voor XlsxEditor (Rekenblad). */
  rekenblad: RekenbladVertaling;
  /** Voor PptxEditor (Presentatie). */
  dia: DiaVertaling;
}

type Module<T> = Promise<{ default: T }>;
type Lader = () => Promise<[Module<TekstVertaling>, Module<RekenbladVertaling>, Module<DiaVertaling>]>;
const drie = (t: Module<TekstVertaling>, r: Module<RekenbladVertaling>, d: Module<DiaVertaling>) =>
  Promise.resolve([t, r, d] as [typeof t, typeof r, typeof d]);

/** Localepakketten van de engine; elk een eigen chunk. */
const PAKKETTEN: Partial<Record<Taal, Lader>> = {
  de: () => drie(import("@betteroffice/docx-i18n/de"), import("@betteroffice/xlsx-i18n/de"), import("@betteroffice/pptx-i18n/de")),
  fr: () => drie(import("@betteroffice/docx-i18n/fr"), import("@betteroffice/xlsx-i18n/fr"), import("@betteroffice/pptx-i18n/fr")),
  pl: () => drie(import("@betteroffice/docx-i18n/pl"), import("@betteroffice/xlsx-i18n/pl"), import("@betteroffice/pptx-i18n/pl")),
  tr: () => drie(import("@betteroffice/docx-i18n/tr"), import("@betteroffice/xlsx-i18n/tr"), import("@betteroffice/pptx-i18n/tr")),
  he: () => drie(import("@betteroffice/docx-i18n/he"), import("@betteroffice/xlsx-i18n/he"), import("@betteroffice/pptx-i18n/he")),
  hi: () => drie(import("@betteroffice/docx-i18n/hi"), import("@betteroffice/xlsx-i18n/hi"), import("@betteroffice/pptx-i18n/hi")),
  id: () => drie(import("@betteroffice/docx-i18n/id"), import("@betteroffice/xlsx-i18n/id"), import("@betteroffice/pptx-i18n/id")),
  "pt-BR": () =>
    drie(import("@betteroffice/docx-i18n/pt-BR"), import("@betteroffice/xlsx-i18n/pt-BR"), import("@betteroffice/pptx-i18n/pt-BR")),
  "zh-CN": () =>
    drie(import("@betteroffice/docx-i18n/zh-CN"), import("@betteroffice/xlsx-i18n/zh-CN"), import("@betteroffice/pptx-i18n/zh-CN")),
};
/** Talen die (voorlopig) de engine-vertaling van een verwante taal lenen. */
const LEEN: Partial<Record<Taal, Taal>> = { "pt-PT": "pt-BR" };

/** Herkomst per taal; ook voor tests en documentatie. */
export const ENGINE_BRON: Record<Taal, "eigen" | "engine" | "enginepakket" | "geleend" | "terugval"> =
  Object.fromEntries(
    TAALCODES.map((taal) => [
      taal,
      taal === "nl" || taal === "es"
        ? "eigen"
        : taal === "en"
          ? "engine"
          : PAKKETTEN[taal]
            ? "enginepakket"
            : LEEN[taal]
              ? "geleend"
              : "terugval",
    ]),
  ) as Record<Taal, "eigen" | "engine" | "enginepakket" | "geleend" | "terugval">;

const geladen = new Map<Taal, EngineVertaling>([
  ["nl", { tekst: tekstNlVolledig, rekenblad: rekenbladNlVolledig, dia: diaNlVolledig }],
  [
    "en",
    {
      tekst: tekstEn as TekstVertaling,
      rekenblad: rekenbladEn as RekenbladVertaling,
      dia: diaEn as DiaVertaling,
    },
  ],
]);

async function haal(taal: Taal): Promise<EngineVertaling> {
  if (taal === "es") {
    const es = await import("./engine/es");
    return { tekst: es.tekstEs, rekenblad: es.rekenbladEs, dia: es.diaEs };
  }
  const bron = LEEN[taal] ?? taal;
  const lader = PAKKETTEN[bron];
  if (!lader) return geladen.get(TERUGVALTAAL)!;
  const [t, r, d] = await Promise.all(await lader());
  return { tekst: t.default, rekenblad: r.default, dia: d.default };
}

/** Al geladen vertaling, of null als die nog (lui) geladen moet worden. */
export function engineVertalingDirect(taal: Taal): EngineVertaling | null {
  return geladen.get(taal) ?? null;
}

/** De engine-vertaling voor een taal; lui geladen en daarna bewaard. */
export async function laadEngineVertaling(taal: Taal): Promise<EngineVertaling> {
  const bekend = geladen.get(taal);
  if (bekend) return bekend;
  try {
    const vertaling = await haal(taal);
    geladen.set(taal, vertaling);
    return vertaling;
  } catch (fout) {
    console.warn(`Engine-vertaling ${taal} niet geladen, Engels gebruikt:`, fout);
    return geladen.get(TERUGVALTAAL)!;
  }
}

/**
 * De engine-vertaling voor de huidige interfacetaal. Tijdens het lui laden
 * blijft de vorige vertaling staan, zodat de editor niet knippert.
 */
export function useEngineVertaling(): EngineVertaling {
  const { i18n } = useTranslation();
  const ruw = i18n.resolvedLanguage ?? i18n.language;
  const taal: Taal = isTaal(ruw) ? ruw : TERUGVALTAAL;
  const [stand, setStand] = useState<{ taal: Taal; vertaling: EngineVertaling }>(() => ({
    taal,
    vertaling: engineVertalingDirect(taal) ?? geladen.get(TERUGVALTAAL)!,
  }));
  useEffect(() => {
    if (stand.taal === taal && geladen.has(taal)) return;
    let actief = true;
    void laadEngineVertaling(taal).then((vertaling) => {
      if (actief) setStand({ taal, vertaling });
    });
    return () => {
      actief = false;
    };
  }, [taal, stand.taal]);
  if (stand.taal === taal) return stand.vertaling;
  return engineVertalingDirect(taal) ?? stand.vertaling;
}
