/** Eén kleur per uniek blad en bereik, gedeeld door formuletekst en raster. */
import { verwijzingenIn, type Verwijzing } from "./rekenblad-functies";

export const VERWIJZINGSKLEUREN = ["#2b6cd8", "#c43d3d", "#7a3fc4", "#1f8a4c", "#c4721f", "#b8379a", "#2a8d96", "#7d6a12"];

export interface GekleurdeVerwijzing extends Verwijzing {
  kleur: string;
}

export function formuleVerwijzingen(formule: string, huidigBlad: string) {
  const kleuren = new Map<string, string>();
  const markeringen: Pick<GekleurdeVerwijzing, "blad" | "bereik" | "kleur">[] = [];
  const verwijzingen: GekleurdeVerwijzing[] = verwijzingenIn(formule).map((r) => {
    const { top, left, bottom, right } = r.bereik;
    const sleutel = JSON.stringify([(r.blad ?? huidigBlad).toLowerCase(), top, left, bottom, right]);
    let kleur = kleuren.get(sleutel);
    if (!kleur) {
      kleur = VERWIJZINGSKLEUREN[kleuren.size % VERWIJZINGSKLEUREN.length];
      kleuren.set(sleutel, kleur);
      markeringen.push({ blad: r.blad, bereik: r.bereik, kleur });
    }
    return { ...r, kleur };
  });
  return { verwijzingen, markeringen };
}
