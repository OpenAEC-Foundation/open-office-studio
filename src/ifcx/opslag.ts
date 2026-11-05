import type { Soort } from "../editors";
import { bereidOpslag, type Bronkenmerken } from "../import/bron";
import { MACROFORMAAT } from "../import/macros";
import { herkenVersleuteling } from "../import/versleuteling";
import { Buffer } from "buffer";
import i18next from "../i18n/config";
import { ATTR, maakIfcx, openIfcx } from "./dossier";

/** Wacht ook op nog verwerkte invoer vóór de keuze voor de oorspronkelijke bron. */
export async function serialiseerIfcxBron(
  serialiseer: () => Promise<Uint8Array>,
  origineel: Uint8Array,
  isOngewijzigd: () => boolean,
) {
  const actueel = await serialiseer();
  const ongewijzigd = isOngewijzigd();
  return { bytes: ongewijzigd ? origineel : actueel, ongewijzigd };
}

/** Dezelfde bronvoorbereiding voor Opslaan als, Ctrl+S en herstelkopieën. */
export async function bereidIfcxOpslag(opties: {
  soort: Soort;
  naam: string;
  bytes: Uint8Array;
  bron?: Bronkenmerken | null;
  wachtwoord?: string;
  ongewijzigd?: boolean;
}) {
  const vorige = opties.bron?.ifcx;
  // Een ongewijzigd geopend IFCX-bestand blijft letterlijk gelijk, ook met
  // een versleutelde bron. Hiervoor is geen ontsleutelwachtwoord nodig.
  if (vorige && opties.ongewijzigd && !opties.wachtwoord)
    return maakIfcx({ ...opties, vorige });
  if (vorige && opties.wachtwoord) {
    // Oude bronnen blijven staan vanwege onbekende verwijzingen. Alleen de
    // nieuwe bron versleutelen zou oudere inhoud leesbaar achterlaten.
    await openIfcx(new TextEncoder().encode(vorige.origineel));
    const dossier = JSON.parse(vorige.origineel.replace(/^\uFEFF/, "")) as {
      data: { attributes?: Record<string, { content: string }> }[];
    };
    const heeftLeesbareBron = dossier.data.some((node) => {
      const payload = node.attributes?.[ATTR + "payload"];
      if (!payload) return false;
      const soort = herkenVersleuteling(new Uint8Array(Buffer.from(payload.content, "base64")))?.soort;
      return soort !== "agile" && soort !== "standard";
    });
    if (heeftLeesbareBron)
      throw new Error(i18next.t("import:ifcx.historyPassword"));
  }
  const macro = !!opties.bron?.macro;
  const klaar = await bereidOpslag({
    ...opties,
    ext: macro ? MACROFORMAAT[opties.soort] : opties.soort,
  });
  return maakIfcx({ ...opties, bytes: klaar.bytes, macro, vorige });
}
