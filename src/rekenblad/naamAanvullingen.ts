/** Gezamenlijke voorstellen voor functies en zichtbare naamdefinities (#70). */
import { aanvullingen, type Functie } from "../lint/rekenblad-functies";
import { zichtbareNamen, type Bereiknaam } from "./namen";

export type FormuleVoorstel =
  | { soort: "functie"; naam: string; functie: Functie }
  | { soort: "naam"; naam: string; verwijzing: string };

export function formuleAanvullingen(
  woord: string,
  namen: Bereiknaam[],
  blad: number,
  max = 12,
): FormuleVoorstel[] {
  const w = woord.toLowerCase();
  if (!w || max <= 0) return [];
  const functies: FormuleVoorstel[] = aanvullingen(woord, 1000).map((f) => ({
    soort: "functie",
    naam: f.naam,
    functie: f,
  }));
  const bereiken: FormuleVoorstel[] = zichtbareNamen(namen, blad)
    .filter((n) => n.naam.toLowerCase().startsWith(w))
    .map((n) => ({ soort: "naam", naam: n.naam, verwijzing: n.verwijzing }));
  return [...bereiken, ...functies]
    .sort(
      (a, b) =>
        Number(b.naam.toLowerCase() === w) -
          Number(a.naam.toLowerCase() === w) ||
        a.naam.toLowerCase().localeCompare(b.naam.toLowerCase(), "en") ||
        Number(b.soort === "naam") - Number(a.soort === "naam"),
    )
    .slice(0, max);
}

/** Een bereik, constante of benoemde formule wordt zonder functiehaakje ingevoegd. */
export function aangevuldeFormule(
  tekst: string,
  begin: number,
  cursor: number,
  voorstel: FormuleVoorstel,
) {
  const invoer = voorstel.naam + (voorstel.soort === "functie" ? "(" : "");
  return {
    tekst: tekst.slice(0, begin) + invoer + tekst.slice(cursor),
    cursor: begin + invoer.length,
  };
}
