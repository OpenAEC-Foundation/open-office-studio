/**
 * De taal van een werkmap of presentatie voor de spellingcontrole.
 *
 * - XLSX kent alleen `dc:language` in docProps/core.xml (Excel schrijft het
 *   zelden); anders de instelling (Instellingen › Spelling) of de interfacetaal.
 * - PPTX schrijft de taal per tekstrun (`a:rPr/@lang`, `a:endParaRPr/@lang`)
 *   en als standaard in `p:defaultTextStyle`; we nemen de meest gebruikte taal
 *   op de dia's, dan de standaard uit presentation.xml, dan `dc:language`.
 *
 * De engines geven de taal niet door; daarom lezen we het pakket zelf, één
 * keer bij het openen (alleen de kleine XML-delen, niet de media).
 */
import { strFromU8, unzipSync } from "fflate";
import i18next from "../../i18n/config";
import { leesInstellingen } from "../../instellingen";
import { standaardTaal, taalUitCode, type Taal, type TaalId } from "../talen";

const KERN = "docProps/core.xml";
const DIA = /^ppt\/slides\/slide\d+\.xml$/;
const PRESENTATIE = "ppt/presentation.xml";

/** De taal uit de instellingen, of die van de interface (en het systeem). */
export function standaardDocumentTaal(): TaalId {
  const keuze = leesInstellingen().spelling.standaardTaal;
  if (keuze !== "auto") return keuze;
  const systeem = typeof navigator !== "undefined" ? [...(navigator.languages ?? [])] : [];
  return standaardTaal([i18next.language, ...systeem].filter(Boolean));
}

/** `dc:language` uit docProps/core.xml. */
export function taalUitKern(xml: string | undefined): Taal | null {
  const m = /<dc:language>\s*([^<\s]+)\s*<\/dc:language>/.exec(xml ?? "");
  return taalUitCode(m?.[1]);
}

/** De meest gebruikte `lang="…"` in dia-XML (runs en alinea-einden). */
export function taalUitDias(xmls: readonly string[]): Taal | null {
  const telling = new Map<Taal, number>();
  for (const xml of xmls)
    for (const m of xml.matchAll(/<a:(?:rPr|endParaRPr|defRPr)\b[^>]*?\slang="([^"]+)"/g)) {
      const taal = taalUitCode(m[1]);
      if (taal) telling.set(taal, (telling.get(taal) ?? 0) + 1);
    }
  let beste: Taal | null = null;
  let meeste = 0;
  for (const [taal, n] of telling)
    if (n > meeste) {
      beste = taal;
      meeste = n;
    }
  return beste;
}

/**
 * De documenttaal uit de bytes, of null als het bestand er geen noemt (of
 * niet te lezen is). "geen" betekent: een taal zonder woordenboek (Duits,
 * Frans, …), dus niet controleren.
 */
export function documentTaalUitPakket(bytes: Uint8Array | null, soort: "xlsx" | "pptx"): Taal | null {
  if (!bytes?.byteLength) return null;
  let bestanden: Record<string, Uint8Array>;
  try {
    bestanden = unzipSync(bytes, {
      filter: (f) =>
        f.name === KERN || (soort === "pptx" && (f.name === PRESENTATIE || (DIA.test(f.name) && f.originalSize < 4_000_000))),
    });
  } catch {
    return null;
  }
  const tekst = (naam: string) => (bestanden[naam] ? strFromU8(bestanden[naam]) : undefined);
  if (soort === "pptx") {
    const dias = Object.keys(bestanden)
      .filter((n) => DIA.test(n))
      .map(tekst)
      .filter((x): x is string => !!x);
    const uitDias = taalUitDias(dias);
    if (uitDias) return uitDias;
    const standaard = taalUitDias([tekst(PRESENTATIE) ?? ""]);
    if (standaard) return standaard;
  }
  return taalUitKern(tekst(KERN));
}
