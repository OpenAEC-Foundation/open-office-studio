/**
 * Weergave van een presentatie (normaal of diasorteerder), per document en
 * los van React: het lint én de statusbalk schakelen hem, en hij blijft
 * staan als de editor na een pakketbewerking opnieuw laadt.
 */
import { useSyncExternalStore } from "react";

export type DiaWeergave = "normaal" | "sorteerder";

interface Staat {
  weergave: DiaWeergave;
  /** Geselecteerde dia's in de sorteerder (0-gebaseerd). */
  selectie: number[];
  /** Laatste melding van de sorteerder (blijft staan na herladen). */
  bericht?: string;
}

const staten = new WeakMap<object, Staat>();
const luisteraars = new Set<() => void>();
const meld = () => luisteraars.forEach((l) => l());
const volg = (l: () => void) => {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
};

const leeg: Staat = { weergave: "normaal", selectie: [] };
export const leesWeergave = (sleutel: object | null | undefined): Staat =>
  (sleutel && staten.get(sleutel)) || leeg;

export function zetWeergave(sleutel: object, wijziging: Partial<Staat>) {
  staten.set(sleutel, { ...leesWeergave(sleutel), ...wijziging });
  meld();
}

export function useDiaWeergave(sleutel: object | null | undefined) {
  return useSyncExternalStore(volg, () => leesWeergave(sleutel), () => leesWeergave(sleutel));
}

/** Bediening voor de statusbalk van de zichtbare presentatie. */
export interface WeergaveBediening {
  weergave: DiaWeergave;
  zet: (weergave: DiaWeergave) => void;
  voorstelling: () => void;
}
let bediening: { eigenaar: object; waarde: WeergaveBediening } | null = null;
export function publiceerWeergave(eigenaar: object, waarde: WeergaveBediening | null) {
  if (waarde) bediening = { eigenaar, waarde };
  else if (bediening?.eigenaar === eigenaar) bediening = null;
  else return;
  meld();
}
const leesBediening = () => bediening?.waarde ?? null;
export const useWeergaveBediening = () => useSyncExternalStore(volg, leesBediening, leesBediening);
