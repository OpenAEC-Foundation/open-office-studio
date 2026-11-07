import { cmNaarTwips, twipsNaarCm, type Kolommen } from "./secties";

/** De getoonde centimeters mogen een ongewijzigde bronmaat niet afronden. */
export function kolomkeuze(begin: Kolommen, aantal: number, ruimteCm: number, lijn: boolean): Kolommen {
  const tussenruimte = ruimteCm === twipsNaarCm(begin.tussenruimte)
    ? begin.tussenruimte : cmNaarTwips(ruimteCm);
  const zelfdeMaten = aantal === begin.aantal && tussenruimte === begin.tussenruimte;
  // Dezelfde keuze blijft hetzelfde object: het venster hoeft dan niet te herladen.
  if (zelfdeMaten && lijn === begin.lijn) return begin;
  return {
    aantal, tussenruimte, lijn: lijn && aantal > 1,
    ...(zelfdeMaten && begin.breedtes ? { breedtes: begin.breedtes } : {}),
  };
}
