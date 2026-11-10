import type { Soort } from "../editors";
import type { AfdrukBron } from "../afdrukken/bron";

/**
 * Wat Opslaan als van de geopende editor nodig heeft voor exports die de
 * live weergave gebruiken: het actieve blad, de huidige dia en afdrukken.
 */
export interface EditorKoppeling {
  soort: Soort;
  /** Focus op het bestaande werkvlak, zonder de selectie of geschiedenis te wijzigen. */
  focus?: () => void;
  /** Opent het afdrukvoorbeeld van de editor. */
  afdrukken?: () => Promise<void> | void;
  bladen?: () => { namen: string[]; actief: number };
  dias?: () => { aantal: number; huidig: number };
  /** De pagina's voor afdrukvoorbeeld, afdrukken en PDF. */
  afdrukbron?: () => AfdrukBron;
  /** PNG van één dia (0-gebaseerd) via dezelfde tekenroutine als de editor. */
  diaPng?: (index: number, schaal?: number) => Promise<Uint8Array>;
}

let huidig: EditorKoppeling | null = null;

export function registreerKoppeling(koppeling: EditorKoppeling) {
  huidig = koppeling;
  return () => {
    if (huidig === koppeling) huidig = null;
  };
}

export const editorKoppeling = (soort: Soort) =>
  huidig?.soort === soort ? huidig : null;

/** De koppeling van de zichtbare editor, ongeacht de soort. */
export const actieveKoppeling = () => huidig;
