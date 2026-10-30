import gegevens from "../../assets/studios.json";
import type { Soort } from "../editors";

export type StudioModule = Soort | "email" | "notities" | "database";
export interface Studio {
  sleutel: string;
  naam: string;
  programma: string;
  identifier: string;
  module: StudioModule | null;
}
export const studios = gegevens as readonly Studio[];

/** Een onbekende bouwkeuze mag nooit ongemerkt de volledige suite opleveren. */
export function kiesStudio(sleutel = "office"): Studio {
  const studio = studios.find((s) => s.sleutel === sleutel);
  if (!studio) throw new Error(`Onbekende studio: ${sleutel}`);
  return studio;
}

export function isDocumentmodule(module: StudioModule | null): module is Soort {
  return module === "docx" || module === "xlsx" || module === "pptx";
}

/** E-mail behoudt documentvoorbeelden voor bijlagen; de gerichte editors openen alleen hun eigen soort. */
export function staatDocumentToe(studio: Studio, soort: Soort): boolean {
  return (
    studio.module === null ||
    studio.module === "email" ||
    studio.module === soort
  );
}
