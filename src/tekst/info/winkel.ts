/**
 * Kleine gedeelde winkels voor Open Tekst Studio buiten de React-boom van
 * de editor: wat de statusbalk extra toont (taal, bijhouden, weergave), het
 * openen van Bestand › Info voor het laatst zichtbare document, en het
 * aansluitpunt voor de spellingcontrole (pakket W5).
 */
import { useSyncExternalStore } from "react";

function winkel<T>(begin: T) {
  let waarde = begin;
  const luisteraars = new Set<() => void>();
  return {
    lees: () => waarde,
    zet(nieuw: T) {
      waarde = nieuw;
      luisteraars.forEach((l) => l());
    },
    volg(l: () => void) {
      luisteraars.add(l);
      return () => {
        luisteraars.delete(l);
      };
    },
  };
}

// --- Statusbalk ------------------------------------------------------------

export type Weergave = "afdruk" | "lees";

export interface TekstExtraStatus {
  /** BCP-47-code en naam (in de interfacetaal) van de taal op de cursor, of null. */
  taal: { code: string; naam: string } | null;
  kiesTaal: () => void;
  /** Wijzigingen bijhouden aan/uit; null als het niet beschikbaar is. */
  bijhouden: boolean | null;
  wisselBijhouden: () => void;
  weergave: Weergave;
  zetWeergave: (weergave: Weergave) => void;
}

const extra = winkel<{ eigenaar: object; status: TekstExtraStatus } | null>(null);

export function publiceerTekstExtra(eigenaar: object, status: TekstExtraStatus | null) {
  const huidig = extra.lees();
  if (status) extra.zet({ eigenaar, status });
  else if (huidig?.eigenaar === eigenaar) extra.zet(null);
}
export const useTekstExtra = () =>
  useSyncExternalStore(extra.volg, () => extra.lees()?.status ?? null, () => null);

// --- Bestand › Info --------------------------------------------------------

const zichtbaar = winkel<object | null>(null);
const infoVerzoek = winkel<{ eigenaar: object; n: number; terug?: () => void } | null>(null);

/** Het zichtbare tekstdocument meldt zich; blijft gelden tot een ander zich meldt. */
export function meldZichtbaar(eigenaar: object) {
  zichtbaar.zet(eigenaar);
}
export function meldVerdwenen(eigenaar: object) {
  if (zichtbaar.lees() === eigenaar) zichtbaar.zet(null);
}
/**
 * Bestand › Info voor het laatst zichtbare tekstdocument. `terug` brengt de
 * gebruiker naar het document; dat gebeurt na een bewerking die het document
 * opnieuw laadt (een verborgen editor tekent zich pas als hij zichtbaar is).
 */
export function toonDocumentInfo(terug?: () => void) {
  const eigenaar = zichtbaar.lees();
  if (eigenaar) infoVerzoek.zet({ eigenaar, n: (infoVerzoek.lees()?.n ?? 0) + 1, terug });
}
export const useInfoVerzoek = () => useSyncExternalStore(infoVerzoek.volg, infoVerzoek.lees, () => null);

// --- Taal en spelling (pakket W5) -------------------------------------------

/**
 * Aansluitpunt voor de spellingcontrole (pakket W5). Registreer:
 * - `kiesTaal(huidig)`: opent het taalvenster van de spellingcontrole bij een
 *   klik op de taal in de statusbalk (anders opent het eenvoudige venster
 *   hier, dat de documenttaal instelt);
 * - `status()`: korte tekst voor de statusbalk, zoals "3 spelfouten", of null;
 * - roep `meld()` (de teruggegeven functie) aan als de status verandert.
 */
export interface TaalAansluiting {
  kiesTaal?: (huidig: string | null) => void;
  status?: () => string | null;
}
const taal = winkel<TaalAansluiting>({});

export function registreerTaalAansluiting(aansluiting: TaalAansluiting) {
  taal.zet(aansluiting);
  return {
    meld: () => taal.zet({ ...taal.lees() }),
    stop: () => {
      // `meld` zet een kopie; vergelijk daarom de functies (beide, zodat een
      // aansluiting zonder kiesTaal niet die van een ander document wist).
      const nu = taal.lees();
      if (nu === aansluiting || (nu.kiesTaal === aansluiting.kiesTaal && nu.status === aansluiting.status)) taal.zet({});
    },
  };
}
export const useTaalAansluiting = () => useSyncExternalStore(taal.volg, taal.lees, taal.lees);
