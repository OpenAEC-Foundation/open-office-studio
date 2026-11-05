import type { Soort } from "./editors";
import type { BewaarUitkomst } from "./opslag";
import { blokkeerBijVerlies } from "./export/bewaar";
import { converteer } from "./formaten";
import { MACROUITVOER, bereidOpslag, type Bronkenmerken } from "./import/bron";
import { bereidIfcxOpslag } from "./ifcx/opslag";

/**
 * Werkbestand van een documenttabblad (alleen in de desktopapp).
 *
 * Het pad blijft aan Rust-zijde (`src-tauri/src/werkbestanden.rs`); de
 * webview kent alleen een pad-token en de bestandsnaam. Ctrl+S schrijft
 * atomair terug naar dat pad:
 *
 * - **Eigen formaat (DOCX/XLSX/PPTX):** direct terugschrijven.
 * - **Geïmporteerd ODT, DOC, enz.:** de eerste Ctrl+S vraagt eenmalig per
 *   tabblad of het bestand in zijn eigen formaat bijgewerkt mag worden, met de
 *   verliesmelding. Daarna zet de kantoorruntime het document om en schrijft
 *   Rust het terug. Kiest de gebruiker "Opslaan als…", of is er geen runtime,
 *   dan opent Opslaan als (standaard in het eigen formaat).
 * - **Extern gewijzigd of verdwenen:** Rust vraagt Overschrijven, Opslaan als
 *   of Annuleren.
 * - **Alleen-lezen of geen schrijfrechten:** melding en Opslaan als.
 *
 * Zonder werkbestand (nieuw document, of de browser) gedraagt de eerste
 * Ctrl+S zich als Opslaan als; daarna bewaart Ctrl+S opnieuw met dezelfde
 * keuze (browser: als download). Opslaan als in het eigen formaat maakt van
 * het gekozen pad het nieuwe werkbestand.
 */
export interface Werkbestand {
  token: string;
  /** Bestandsnaam op schijf, bijv. "verslag.odt". */
  naam: string;
  /** Terugschrijven in een niet-eigen formaat is al eenmaal bevestigd. */
  bevestigd?: boolean;
}

export const desktop =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function extensieVan(naam: string) {
  const m = /\.([^.]+)$/.exec(naam);
  return m ? m[1].toLowerCase() : "";
}

export type Opslagplan =
  /** Terugschrijven naar het werkbestand, eventueel na bevestiging. */
  | { route: "terugschrijven"; ext: string; bevestigen: boolean }
  /** Opnieuw bewaren met de laatst gekozen opties uit Opslaan als. */
  | { route: "keuze" }
  /** Eerst Opslaan als tonen. */
  | { route: "opslaanAls" };

/** Wat Ctrl+S voor dit tabblad doet. */
export function opslagplan(tabblad: {
  soort: Soort;
  werkbestand: Werkbestand | null;
  /** Er is in deze sessie al eens via Opslaan als gekozen. */
  heeftKeuze: boolean;
}): Opslagplan {
  const { werkbestand, soort } = tabblad;
  if (werkbestand) {
    const ext = extensieVan(werkbestand.naam);
    return {
      route: "terugschrijven",
      ext,
      bevestigen: ext !== soort && ext !== "ifcx" && !werkbestand.bevestigd,
    };
  }
  return tabblad.heeftKeuze ? { route: "keuze" } : { route: "opslaanAls" };
}

async function core() {
  return import("@tauri-apps/api/core");
}

/** Eenmalige vraag voor terugschrijven in een niet-eigen formaat. */
export async function bevestigFormaat(
  naam: string,
  melding: string | null,
): Promise<"ja" | "opslaan-als" | "annuleren"> {
  const { invoke } = await core();
  return invoke("bevestig_formaat", { naam, melding });
}

type Terugschrijfuitkomst =
  | { status: "opgeslagen"; naam: string; pad: string }
  | { status: "opslaan-als" | "geannuleerd" }
  | { status: "extern-gewijzigd" | "ontbreekt" }
  | { status: "alleen-lezen" | "ander-formaat" };

/**
 * Schrijft het document terug naar het werkbestand. Een niet-eigen formaat
 * (ODT, DOC, …) zet de kantoorruntime eerst om.
 */
export async function schrijfTerug(
  soort: Soort,
  werkbestand: Werkbestand,
  ext: string,
  bytes: Uint8Array,
  /** Versleuteling en macro’s (src/import/bron.ts); het wachtwoord alleen uit het geheugen. */
  extra: {
    bron?: Bronkenmerken | null;
    wachtwoord?: string;
    ongewijzigd?: boolean;
  } = {},
): Promise<BewaarUitkomst> {
  // Een macroformaat met het VBA-project van het origineel schrijft de app zelf.
  const eigen =
    ext === soort ||
    ext === "ifcx" ||
    (MACROUITVOER.has(ext) && !!extra.bron?.macro);
  blokkeerBijVerlies(bytes, soort, eigen);
  let uitvoer = bytes;
  let toelichting: string | undefined;
  let ifcx: import("./ifcx/dossier").IfcxBron | undefined;
  if (ext === "ifcx") {
    const klaar = await bereidIfcxOpslag({
      soort,
      naam: werkbestand.naam,
      bytes,
      ...extra,
    });
    uitvoer = klaar.bytes;
    ifcx = klaar.bron;
  } else if (eigen) {
    const klaar = await bereidOpslag({ bytes, soort, ext, ...extra });
    uitvoer = klaar.bytes;
    toelichting = klaar.toelichting;
  } else {
    try {
      uitvoer = await converteer(bytes, soort, ext, soort);
    } catch (fout) {
      return {
        status: "opslaan-als",
        toelichting: `${werkbestand.naam} kon niet als .${ext} worden bijgewerkt (${fout instanceof Error ? fout.message : String(fout)}). Kies in Opslaan als bijvoorbeeld .${soort}.`,
      };
    }
  }
  const { invoke } = await core();
  const uitkomst = await invoke<Terugschrijfuitkomst>(
    "bewaar_document",
    uitvoer,
    {
      headers: {
        "x-office-token": werkbestand.token,
        "x-office-ext": ext,
      },
    },
  );
  const vertaald = vertaal(uitkomst, werkbestand.naam);
  return vertaald.status === "opgeslagen"
    ? { ...vertaald, toelichting, ifcx }
    : vertaald;
}

export function vertaal(
  uitkomst: Terugschrijfuitkomst,
  naam: string,
): BewaarUitkomst {
  switch (uitkomst.status) {
    case "opgeslagen":
      return { status: "opgeslagen", pad: uitkomst.pad };
    case "geannuleerd":
    case "extern-gewijzigd":
    case "ontbreekt":
      return { status: "geannuleerd" };
    case "alleen-lezen":
      return {
        status: "opslaan-als",
        toelichting: `${naam} is alleen-lezen of je hebt geen schrijfrechten in die map. Kies in Opslaan als een andere plek.`,
      };
    case "ander-formaat":
      return {
        status: "opslaan-als",
        toelichting: `${naam} kan niet in dit formaat worden bijgewerkt. Kies in Opslaan als een naam en formaat.`,
      };
    case "opslaan-als":
      return { status: "opslaan-als" };
  }
}

/** Het token vervalt (tabblad gesloten); Rust controleert dat het van dit venster is. */
export function vergeetWerkbestand(token: string) {
  if (!desktop) return;
  void core()
    .then(({ invoke }) => invoke("vergeet_werkbestand", { token }))
    .catch(() => undefined);
}

/** Native bestandskiezer; de gekozen bestanden komen binnen via de route van de systeembestanden. */
export async function kiesBestanden(extensies: string[]) {
  const { invoke } = await core();
  return invoke<number>("kies_bestanden", { extensies });
}
