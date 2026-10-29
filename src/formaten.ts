import catalogus from "./formaten.json";
import type { Soort } from "./editors";
import i18next from "./i18n/config";

export const bestandstypen = catalogus;

/** Groepen in Opslaan als, in deze volgorde (vertaald via `backstage:saveAs.groups`). */
export const GROEPEN = {
  eigen: "Eigen formaat",
  opendocument: "OpenDocument",
  "office-oud": "Oudere Office-formaten",
  sjablonen: "Sjablonen",
  macro: "Macro-ingeschakeld",
  "web-tekst": "Web en tekst",
  "pdf-afbeelding": "PDF en afbeelding",
} as const;
export type Groep = keyof typeof GROEPEN;

/** Een uitvoerformaat uit de gedeelde catalogus (ook gelezen door Rust). */
export interface Uitvoerformaat {
  ext: string;
  naam: string;
  groep: Groep;
  /** `engine`: de app maakt het zelf (ook in de browser); `runtime`: via de kantoorruntime. */
  route: "engine" | "runtime";
  /** Korte verwachting over wat behouden blijft. */
  behoud: string;
  /** Exportfilter van de kantoorruntime; ontbreekt als alleen de app het kan maken. */
  filter?: string;
  opties?: string;
  /** Vervangende route zonder runtime: afdrukken naar PDF, of tekst/HTML uit de engine. */
  zonderRuntime?: "afdrukken" | "tekst" | "html";
}

/** Hoe dit formaat nu daadwerkelijk wordt gemaakt. */
export type Route = "engine" | "runtime" | "afdrukken" | "tekst" | "html";

export function uitvoerlijst(soort: Soort): Uitvoerformaat[] {
  return Object.entries(catalogus[soort].uitvoer).map(([ext, formaat]) => ({
    ext,
    ...(formaat as Omit<Uitvoerformaat, "ext">),
  }));
}
export function uitvoerformaat(soort: Soort, ext: string) {
  return uitvoerlijst(soort).find((formaat) => formaat.ext === ext) ?? null;
}

/**
 * Kies de route: de engine waar dat kan, anders de runtime als die er is,
 * anders de vervangende route. `null` betekent: alleen met de kantoorruntime.
 */
export function kiesRoute(
  formaat: Uitvoerformaat,
  runtimeBeschikbaar: boolean,
): Route | null {
  if (formaat.route === "engine") return "engine";
  if (runtimeBeschikbaar && formaat.filter) return "runtime";
  return formaat.zonderRuntime ?? null;
}

/** Ext. die zonder runtime beschikbaar zijn (browser) of alle (desktop met runtime). */
export function uitvoerformaten(soort: Soort, runtimeBeschikbaar: boolean) {
  return uitvoerlijst(soort)
    .filter((formaat) => kiesRoute(formaat, runtimeBeschikbaar) !== null)
    .map((formaat) => formaat.ext);
}

export const invoerformaten = Object.values(catalogus)
  .flatMap((module) => module.invoer)
  .map((ext) => `.${ext}`)
  .join(",");
export function bestandssoort(extensie: string): Soort | null {
  return (
    (Object.entries(catalogus).find(([, module]) =>
      module.invoer.includes(extensie),
    )?.[0] as Soort | undefined) ?? null
  );
}

/** Filteropties die Rust controleert en zelf in het filterargument omzet. */
export interface ConversieOpties {
  scheidingsteken?: ";" | "," | "tab" | "|";
  codering?: "utf8" | "utf8-bom" | "windows-1252";
  blad?: number;
  pdfa?: 1 | 2 | 3;
  bladwijzers?: boolean;
  bereik?: string;
}

export async function converteer(
  bytes: Uint8Array,
  van: string,
  naar: string,
  soort: Soort,
  opties?: ConversieOpties,
): Promise<Uint8Array> {
  if (!("__TAURI_INTERNALS__" in window))
    throw new Error(i18next.t("backstage:saveResult.needsDesktop"));
  const { invoke } = await import("@tauri-apps/api/core");
  const headers: Record<string, string> = {
    "x-office-bron": van,
    "x-office-doel": naar,
    "x-office-module": soort,
  };
  if (opties && Object.keys(opties).length)
    headers["x-office-opties"] = JSON.stringify(opties);
  const resultaat = await invoke<ArrayBuffer>("converteer_document", bytes, {
    headers,
  });
  return new Uint8Array(resultaat);
}

export interface ConversieStatus {
  gevonden: boolean;
  pad?: string;
  versie?: string | null;
  bron?: "omgeving" | "instelling" | "automatisch";
  profiel: "eigen" | "veilig";
  gekozen?: string | null;
}

/** Status van de kantoorruntime; in de browser altijd 'niet gevonden'. */
export async function conversieStatus(): Promise<ConversieStatus> {
  if (!("__TAURI_INTERNALS__" in window))
    return { gevonden: false, profiel: "veilig" };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ConversieStatus>("conversie_status");
}
export async function kiesConversieprogramma() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ConversieStatus | null>("kies_conversieprogramma");
}
export async function wisConversieprogramma() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ConversieStatus>("wis_conversieprogramma");
}
