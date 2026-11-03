/** Koppel de eigen opmaak aan precies dezelfde fysieke plakactie in de SDK. */
import type { YrsLoc, YrsSession, YrsStoryRange } from "@betteroffice/docx/yrs";

export type BereidPlakAfronding = (sessie: YrsSession, bereik: YrsStoryRange) => (eind: YrsLoc) => void;
const afrondingen = new WeakMap<Event, { overgenomen: boolean; voorbereiden: BereidPlakAfronding }>();

export function registreerPlakAfronding(gebeurtenis: Event, voorbereiden: BereidPlakAfronding) {
  const afwerking = { overgenomen: false, voorbereiden };
  afrondingen.set(gebeurtenis, afwerking);
  return afwerking;
}

/** Een geweigerde/gesloten native actie mag later geen oude browseropmaak toepassen. */
export function neemPlakAfronding(gebeurtenis?: Event): BereidPlakAfronding | undefined {
  if (!gebeurtenis) return;
  const afwerking = afrondingen.get(gebeurtenis);
  if (!afwerking) return;
  afrondingen.delete(gebeurtenis);
  afwerking.overgenomen = true;
  return afwerking.voorbereiden;
}
