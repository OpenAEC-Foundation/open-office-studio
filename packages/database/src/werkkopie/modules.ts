/**
 * VBA-modules uit de alleen-lezen-analyse omzetten naar de vorm die de
 * werkkopie in `_openaec_modules` bewaart. Voert niets uit.
 */
import i18next from "i18next";
import type { DatabaseObject } from "../model.ts";
import type { VbaModuleRecord, VbaModuleSoort } from "./contract.ts";

/** Soort module uit de naam en het moduletype van de analyse. */
export function moduleSoort(naam: string, moduletype?: string): VbaModuleSoort {
  if (/^(form|report)_/i.test(naam)) return "formulier";
  // De analyse levert de soort in de interfacetaal (analysis.moduleKind.*); de Nederlandse tekst blijft herkend.
  if (moduletype && (/klasse|document/i.test(moduletype) || moduletype === i18next.t("database:analysis.moduleKind.classOrDocument")))
    return "klasse";
  return "module";
}

/** Modules met teruggewonnen broncode uit de objecten van `analyseerDatabase`. */
export function modulesUitAnalyse(objecten: DatabaseObject[]): Pick<VbaModuleRecord, "naam" | "soort" | "bron">[] {
  return objecten
    .filter((o) => o.soort === "VBA" && typeof o.bron === "string")
    .map((o) => ({
      naam: o.naam,
      bron: o.bron!,
      soort: moduleSoort(o.naam, o.eigenschappen?.find(([k]) => k === "Moduletype" || k === i18next.t("database:analysis.property.moduleType"))?.[1]),
    }));
}
