/**
 * Knopuitleg volgens het actieve sneltoetsprofiel: een lintknop noemt de
 * toets uit het standaardprofiel (bijvoorbeeld Ctrl+1 voor Kop 1); in het
 * Word-profiel wordt dat de toets met dezelfde opdracht (Ctrl+Alt+1).
 */
import { useInstellingen } from "../../instellingen";
import {
  normaliseer,
  vasteSneltoetsen,
  type SneltoetsInfo,
  type SneltoetsProfiel,
} from "../../lint/sneltoetsenlijst";

/** Opdrachten (ids) die per profiel anders heten maar hetzelfde doen. */
const ZELFDE: Record<string, string> = {
  clearFormatting: "clearCharacterFormatting",
};

/** De toets voor dezelfde opdracht in het gekozen profiel; undefined als die er niet is. */
export function toetsVoorProfiel(
  toets: string,
  profiel: SneltoetsProfiel,
  lijst: readonly SneltoetsInfo[] = vasteSneltoetsen,
): string | undefined {
  const tekst = lijst.filter((i) => i.module === "tekst");
  const sleutel = normaliseer(toets);
  // Lintknoppen noemen de toets uit het standaardprofiel.
  const standaard = tekst.find(
    (i) => normaliseer(i.toets) === sleutel && i.profiel === "standaard",
  );
  // Een toets die alleen in een ander profiel bestaat (Ctrl+Shift+F voor
  // Lettertype… in het Word-profiel) noemt de knop in dit profiel niet.
  const beschreven = tekst.filter((i) => normaliseer(i.toets) === sleutel);
  if (!standaard && beschreven.length && !beschreven.some((i) => !i.profiel || i.profiel === profiel))
    return undefined;
  // Toetsen die in elk profiel gelden of niet in het register staan: ongewijzigd.
  if (!standaard || profiel === "standaard") return toets;
  const omschrijving = standaard.omschrijving;
  const zelfde = standaard.id ? ZELFDE[standaard.id] : undefined;
  return tekst.find(
    (i) => i.profiel === profiel && (i.omschrijving === omschrijving || (!!zelfde && i.id === zelfde)),
  )?.toets;
}

export function useProfielToets() {
  const profiel = useInstellingen().tekst.sneltoetsprofiel;
  return (toets: string | undefined) => (toets ? toetsVoorProfiel(toets, profiel) : undefined);
}
