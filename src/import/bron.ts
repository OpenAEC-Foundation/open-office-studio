import i18next from "../i18n/config";
import type { Soort } from "../editors";
import type { MacroOnderdelen } from "./macros";

/** Kenmerken van het geopende bronbestand die bij opslaan meetellen. */
export interface Bronkenmerken {
  /** Het origineel was met een wachtwoord versleuteld (het wachtwoord zelf wordt niet bewaard). */
  versleuteling?: "agile" | "standard";
  /** Het VBA-project (byte-identiek) van een DOCM/XLSM/PPTM. */
  macro?: MacroOnderdelen;
}

/** OOXML-formaten die de app zelf schrijft en dus kan versleutelen. */
export const VERSLEUTELBAAR = new Set([
  "docx",
  "xlsx",
  "pptx",
  "docm",
  "xlsm",
  "pptm",
]);

/** Macroformaten die de app zelf schrijft (met het VBA-project van het origineel). */
export const MACROUITVOER = new Set(["docm", "xlsm", "pptm"]);

/**
 * De laatste stap vóór het wegschrijven van een OOXML-pakket in het eigen
 * of macroformaat: het VBA-project terugzetten en eventueel met wachtwoord
 * versleutelen. Het wachtwoord komt alleen uit het geheugen van deze sessie
 * en wordt niet bewaard.
 */
export async function bereidOpslag(opties: {
  bytes: Uint8Array;
  soort: Soort;
  ext: string;
  bron?: Bronkenmerken | null;
  wachtwoord?: string;
}): Promise<{ bytes: Uint8Array; toelichting?: string }> {
  let { bytes } = opties;
  const toelichtingen: string[] = [];
  if (MACROUITVOER.has(opties.ext)) {
    if (!opties.bron?.macro)
      throw new Error(
        i18next.t("import:errors.macroFileOnly", { ext: opties.ext }),
      );
    const { voegMacrosToe } = await import("./macros");
    bytes = voegMacrosToe(bytes, opties.bron.macro, opties.ext);
    if (opties.bron.macro.heeftVba)
      toelichtingen.push(i18next.t("import:saving.vbaRestored"));
  }
  if (opties.wachtwoord && VERSLEUTELBAAR.has(opties.ext)) {
    const { versleutel } = await import("./versleuteling");
    bytes = await versleutel(bytes, opties.wachtwoord);
    toelichtingen.push(i18next.t("import:saving.passwordSaved"));
  }
  return { bytes, toelichting: toelichtingen.join(" ") || undefined };
}
