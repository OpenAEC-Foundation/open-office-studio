/** Macro-aanwezigheid in de bron herkennen vóór conversie de projectdelen weglaat. */
import { unzipSync } from "fflate";
import { isCfb, leesCfb } from "../../packages/database/src/cfb";

export function bronMacros(
  bytes: Uint8Array,
  ext: string,
): "vba" | "scripts" | null {
  try {
    if ((ext === "doc" || ext === "dot") && isCfb(bytes)) {
      return leesCfb(bytes).some((item) =>
        /(?:^|\/)VBA(?:\/|$)/i.test(item.pad),
      )
        ? "vba"
        : null;
    }
    if (
      (ext === "odt" || ext === "ott") &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b
    ) {
      let gevonden = false;
      let aantal = 0;
      // Alleen namen inspecteren: ook de scriptcode wordt niet uitgepakt.
      unzipSync(bytes, {
        filter: (bestand) => {
          if (++aantal > 10_000) throw new Error("Te veel ODF-onderdelen.");
          if (
            /^(Basic|Scripts)\/.+/.test(bestand.name) &&
            !bestand.name.endsWith("/")
          )
            gevonden = true;
          return false;
        },
      });
      return gevonden ? "scripts" : null;
    }
  } catch {
    // Beschadigde of niet-herkende containers blijven voor de normale openroute.
  }
  return null;
}
