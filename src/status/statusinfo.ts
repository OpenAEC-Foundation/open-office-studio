/**
 * Wat de zichtbare editor aan de statusbalk meldt (#28), los van React-props:
 * de editors staan diep in hun eigen boom, de statusbalk in OfficeStudio.
 */
import { useSyncExternalStore } from "react";

export interface TekstStatusInfo {
  soort: "tekst";
  pagina: number;
  paginas: number;
  woorden: number | null;
  tekens: number | null;
  /** Woorden en tekens in de selectie, of null zonder selectie. */
  selectie: { woorden: number; tekens: number } | null;
  naarPagina: () => void;
  woordenTellen: () => void;
}

export interface Statistiek {
  /** Niet-lege cellen (zoals ‘Aantal’ in gangbare rekenbladen). */
  aantal: number;
  getallen: number;
  som: number;
  gemiddelde: number | null;
  minimum: number | null;
  maximum: number | null;
}

export interface RekenbladStatusInfo {
  soort: "rekenblad";
  /** Null bij één cel of een te grote selectie. */
  statistiek: Statistiek | null;
  cellen: number;
  /** Zichtbare en totale gegevensrijen als een filter op het blad criteria heeft (#62). */
  filter?: { zichtbaar: number; totaal: number } | null;
}

export interface PresentatieStatusInfo {
  soort: "presentatie";
  dia: number;
  dias: number;
}

export type ModuleStatus = TekstStatusInfo | RekenbladStatusInfo | PresentatieStatusInfo;

export interface ZoomBediening {
  zet: (zoom: number) => void;
  /** Passend in het venster; ontbreekt als de module dat niet kent. */
  passend?: () => void;
}

function winkel<T>() {
  let waarde: { eigenaar: object; inhoud: T } | null = null;
  const luisteraars = new Set<() => void>();
  const meld = () => luisteraars.forEach((l) => l());
  return {
    zet(eigenaar: object, inhoud: T | null) {
      if (inhoud === null) {
        if (waarde?.eigenaar !== eigenaar) return;
        waarde = null;
      } else waarde = { eigenaar, inhoud };
      meld();
    },
    lees: () => waarde?.inhoud ?? null,
    volg(luisteraar: () => void) {
      luisteraars.add(luisteraar);
      return () => {
        luisteraars.delete(luisteraar);
      };
    },
  };
}

const status = winkel<ModuleStatus>();
const zoom = winkel<ZoomBediening>();

/** Meldt status van een editor; `null` haalt alleen de eigen melding weg. */
export const publiceerStatus = (eigenaar: object, info: ModuleStatus | null) =>
  status.zet(eigenaar, info);
export const useModuleStatus = () => useSyncExternalStore(status.volg, status.lees, status.lees);

export function registreerZoom(eigenaar: object, bediening: ZoomBediening) {
  zoom.zet(eigenaar, bediening);
  return () => zoom.zet(eigenaar, null);
}
export const useZoomBediening = () => useSyncExternalStore(zoom.volg, zoom.lees, zoom.lees);
