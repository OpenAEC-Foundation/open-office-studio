import { useSyncExternalStore } from "react";
import {
  leesBewaardeInstellingen,
  volgInstellingen,
  wijzigInstellingen,
} from "./instellingen";

/** Een voorbeeld in Instellingen verandert nooit de auteur van een bewerking. */
export function leesAuteur() {
  return leesBewaardeInstellingen().gebruiker.naam.trim();
}

export function bewaarAuteur(naam: string) {
  wijzigInstellingen({ gebruiker: { naam } });
}

/** Ook al geopende editors nemen een opgeslagen naamwijziging direct over. */
export function useAuteur() {
  return useSyncExternalStore(volgInstellingen, leesAuteur, leesAuteur);
}
