import i18next from "i18next";
import type { VbaVerwijzingDetail } from "./access-analyse.ts";
/** Adaptercontract: onbekende onderdelen worden nooit als lege, gelezen lijsten gepresenteerd. */
export type Objectsoort =
  | "Tabel"
  | "Query"
  | "Relatie"
  | "VBA"
  | "Formulier"
  | "Rapport"
  | "Macro"
  | "Gekoppelde tabel";
export interface DatabaseIndex {
  naam: string;
  kolommen: string[];
  primair: boolean;
  uniek: boolean;
  extern: boolean;
}
export interface DatabaseObject {
  id: string;
  naam: string;
  soort: Objectsoort;
  kolommen?: string[];
  rijen?: string[][];
  bron?: string;
  totaalRijen?: number;
  kolomtypen?: string[];
  indexen?: DatabaseIndex[];
  eigenschappen?: [string, string][];
  beperkingen?: string[];
}
export type Rapportstatus =
  | "gelezen"
  | "gedeeltelijk"
  | "niet gelezen"
  | "niet aanwezig"
  | "niet uitgevoerd";
export interface Rapportregel {
  onderdeel: string;
  status: Rapportstatus;
  aantal: number | null;
  toelichting: string;
}
export interface Compatibiliteitsrapport {
  bestand: string;
  grootte: number;
  sha256: string;
  formaat: string;
  lezer: string;
  datum: string;
  regels: Rapportregel[];
}
/** Melding voor versleutelde of met een wachtwoord beveiligde databases (in de interfacetaal). */
export const versleuteldMelding = () => i18next.t("database:model.encrypted");
/** Status van een rapportregel in de interfacetaal (de status zelf is een vaste code). */
export const rapportstatusNaam = (status: Rapportstatus) =>
  i18next.t(`database:model.status.${STATUSSLEUTEL[status]}`);
const STATUSSLEUTEL: Record<Rapportstatus, string> = {
  gelezen: "read",
  gedeeltelijk: "partial",
  "niet gelezen": "notRead",
  "niet aanwezig": "notPresent",
  "niet uitgevoerd": "notRun",
};
export interface DatabaseSession {
  naam: string;
  grootte?: number;
  voorbeeld: boolean;
  objecten: DatabaseObject[];
  melding: string;
  rapport?: Compatibiliteitsrapport;
  /** Verwijzingen (typebibliotheken) uit het VBA-project; alleen bij een geopend Access-origineel. */
  vbaVerwijzingen?: VbaVerwijzingDetail[];
}
export function controleerDatabaseBestand(file: File) {
  if (!/\.(mdb|accdb)$/i.test(file.name))
    throw new Error(i18next.t("database:model.chooseMdb"));
  if (!file.size)
    throw new Error(i18next.t("database:model.emptyFile"));
  if (file.size > 100 * 1024 * 1024)
    throw new Error(i18next.t("database:model.tooLarge"));
}
export const voorbeeld: DatabaseSession = {
  naam: "Voorbeelddatabase",
  voorbeeld: true,
  get melding() {
    return i18next.t("database:model.sampleNotice");
  },
  objecten: [
    {
      id: "materialen",
      naam: "Materialen",
      soort: "Tabel",
      kolommen: ["Code", "Omschrijving", "Eenheid"],
      rijen: [
        ["MAT-001", "Hout", "m³"],
        ["MAT-002", "Staal", "kg"],
        ["MAT-003", "Beton", "m³"],
      ],
    },
    {
      id: "selectie",
      naam: "Materialenlijst",
      soort: "Query",
      bron: "SELECT Code, Omschrijving, Eenheid\nFROM Materialen\nORDER BY Code;",
    },
    {
      id: "module",
      naam: "Voorbeeldmodule",
      soort: "VBA",
      bron: 'Option Explicit\n\nPublic Function EenheidLabel() As String\n    EenheidLabel = "m³"\nEnd Function',
    },
  ],
};
export function csv(kolommen: string[], rijen: string[][]): string {
  const cel = (waarde: string) =>
    '"' +
    (/^[=+@\-\t\r\n]/.test(waarde) ? "'" + waarde : waarde).replaceAll(
      '"',
      '""',
    ) +
    '"';
  return (
    "﻿" + [kolommen, ...rijen].map((rij) => rij.map(cel).join(";")).join("\r\n")
  );
}
export function rapportAlsTekst(rapport: Compatibiliteitsrapport): string {
  const t = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(`database:model.reportText.${sleutel}`, opties);
  const regels = [
    t("title"),
    t("file", { value: rapport.bestand }),
    t("size", { value: rapport.grootte }),
    `SHA-256: ${rapport.sha256}`,
    t("format", { value: rapport.formaat }),
    t("reader", { value: rapport.lezer }),
    t("date", { value: rapport.datum }),
    "",
  ];
  for (const regel of rapport.regels)
    regels.push(
      `[${rapportstatusNaam(regel.status)}] ${regel.onderdeel}${regel.aantal === null ? "" : ` (${regel.aantal})`}: ${regel.toelichting}`,
    );
  return regels.join("\r\n") + "\r\n";
}
